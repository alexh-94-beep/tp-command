/**
 * Auto-Anlage von payment-Zeilen pro Buchung.
 *
 * Wann wird das aufgerufen?
 *  - Nach Booking-Insert in src/server/bookings/create.ts
 *  - Nach Pool-Assign in src/server/channels/pending.ts
 *  - Nach Flatfox-Uebernahme in src/server/flatfox/applications.ts
 *  - Taeglich per Vercel-Cron fuer monatliche Mieten (siehe
 *    src/app/api/cron/generate-monthly-rent/route.ts)
 *
 * Pro Mietart erzeugen wir die typischen Plan-Zahlungen:
 *
 *  long_term   1× deposit       (faellig sofort)
 *              1× first_rent    (faellig 14 Tage vor Einzug oder heute)
 *              + monatlich rent (cron-getrieben; siehe generateMonthlyRent)
 *
 *  short_term  1× short_term_flat (faellig 14 Tage vor Einzug oder heute)
 *              + 1× deposit       wenn deposit_amount > 0
 *
 *  booking     1× booking_payout  (Channel zahlt ~14 Tage nach Auszug)
 *
 * Die Funktion ist idempotent: existiert bereits eine Zeile mit gleichem
 * (booking_id, type, due_date), wird sie nicht doppelt angelegt.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { todayIso, addDaysIso, OPEN_END_DATE } from '@/lib/dates';

// ── Pure helpers ───────────────────────────────────────────────────────

export interface PlannedPayment {
  type: 'rent' | 'deposit' | 'first_rent' | 'booking_payout' | 'short_term_flat';
  amount: number;
  due_date: string;
}

export interface BookingForPayments {
  rental_type: 'long_term' | 'short_term' | 'booking';
  start_date: string;
  end_date: string;
  rent_amount: number;
  deposit_amount: number;
  short_term_flat_rate: number | null;
}

/**
 * Die Faelligkeit fuer Erst-Miete / Kurzzeit-Pauschale:
 * Spaeter von (heute, einzug-14 Tage). Das vermeidet, dass eine in
 * 2 Tagen anstehende Buchung eine Zahlung mit due_date in der
 * Vergangenheit produziert.
 */
export function preCheckinDueDate(startDateIso: string, todayIsoStr: string): string {
  const fourteenBefore = addDaysIso(startDateIso, -14);
  return fourteenBefore > todayIsoStr ? fourteenBefore : todayIsoStr;
}

/**
 * Der 1. eines Monats. Wenn der Einzug am 14.7. ist:
 *  monthlyRentDueDate(7) → 2026-08-01
 */
export function monthlyRentDueDate(startDateIso: string, monthOffset: number): string {
  const [y, m] = startDateIso.split('-').map(Number);
  const totalMonths = m + monthOffset;
  const newY = y + Math.floor((totalMonths - 1) / 12);
  const newM = ((totalMonths - 1) % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}-01`;
}

/**
 * Die Plan-Zahlungen, die bei Booking-Insert erzeugt werden sollen.
 * Open-end Langzeit-Vertraege bekommen nur Depot + Erst-Miete; monatliche
 * Mieten generiert der Cron.
 */
export function plannedPaymentsAtCreation(
  b: BookingForPayments,
  todayIsoStr: string,
): PlannedPayment[] {
  const out: PlannedPayment[] = [];

  switch (b.rental_type) {
    case 'long_term': {
      if (b.deposit_amount > 0) {
        out.push({ type: 'deposit', amount: b.deposit_amount, due_date: todayIsoStr });
      }
      if (b.rent_amount > 0) {
        out.push({
          type: 'first_rent',
          amount: b.rent_amount,
          due_date: preCheckinDueDate(b.start_date, todayIsoStr),
        });
      }
      break;
    }
    case 'short_term': {
      const flatRate = b.short_term_flat_rate ?? b.rent_amount;
      if (flatRate > 0) {
        out.push({
          type: 'short_term_flat',
          amount: flatRate,
          due_date: preCheckinDueDate(b.start_date, todayIsoStr),
        });
      }
      if (b.deposit_amount > 0) {
        out.push({
          type: 'deposit',
          amount: b.deposit_amount,
          due_date: preCheckinDueDate(b.start_date, todayIsoStr),
        });
      }
      break;
    }
    case 'booking': {
      if (b.rent_amount > 0 && b.end_date !== OPEN_END_DATE) {
        out.push({
          type: 'booking_payout',
          amount: b.rent_amount,
          due_date: addDaysIso(b.end_date, 14),
        });
      }
      break;
    }
  }

  return out;
}

/**
 * Welche Monate sollen Langzeit-Mieten erzeugen, gegeben heute?
 * Generiert die naechsten 2 Monate, falls sie noch nicht existieren —
 * der Cron ruft das einmal pro Tag auf und ist idempotent.
 *
 * Beispiel: Einzug 14.7.2026, heute 15.6.2026 →
 *   [2026-08-01, 2026-09-01]  (Juli ist die first_rent)
 */
export function nextMonthlyDueDates(
  startDateIso: string,
  todayIsoStr: string,
  lookaheadMonths = 2,
): string[] {
  const out: string[] = [];
  // first_rent deckt den Einzugs-Monat ab. Erste monatliche Miete ist 1. des Folgemonats.
  const [sy, sm] = startDateIso.split('-').map(Number);
  const firstMonthly = `${sm === 12 ? sy + 1 : sy}-${String(sm === 12 ? 1 : sm + 1).padStart(2, '0')}-01`;

  // Starte beim spaeteren von (firstMonthly, Monatsbeginn-heute). Der
  // Idempotenz-Check auf DB-Ebene filtert spaeter Duplikate; daher koennen
  // wir auch ein bereits vergangenes Datum aus dem aktuellen Monat liefern
  // (damit nachhol-Faelle abgedeckt sind, falls der Cron mal nicht lief).
  const startOfThisMonth = todayIsoStr.slice(0, 8) + '01';
  let cursor = firstMonthly > startOfThisMonth ? firstMonthly : startOfThisMonth;
  for (let i = 0; i < lookaheadMonths; i++) {
    out.push(cursor);
    const [cy, cm] = cursor.split('-').map(Number);
    const ny = cm === 12 ? cy + 1 : cy;
    const nm = cm === 12 ? 1 : cm + 1;
    cursor = `${ny}-${String(nm).padStart(2, '0')}-01`;
  }
  return out;
}

// ── DB-Orchestrator ────────────────────────────────────────────────────

export interface GenerateResult {
  created: number;
  skipped: number;
}

/**
 * Erzeugt die Plan-Zahlungen fuer eine konkrete Buchung. Idempotent.
 */
export async function generatePaymentsForBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  today: string = todayIso(),
): Promise<GenerateResult> {
  const { data: booking } = await supabase
    .from('bookings')
    .select(
      'id, rental_type, start_date, end_date, rent_amount, deposit_amount, short_term_flat_rate',
    )
    .eq('id', bookingId)
    .single();
  if (!booking) return { created: 0, skipped: 0 };

  const planned = plannedPaymentsAtCreation(booking, today);

  const { data: existing } = await supabase
    .from('payments')
    .select('type, due_date')
    .eq('booking_id', bookingId);
  const existingKeys = new Set(
    (existing ?? []).map((e) => `${e.type}|${e.due_date}`),
  );

  let created = 0;
  let skipped = 0;
  for (const p of planned) {
    const key = `${p.type}|${p.due_date}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    const { error } = await supabase.from('payments').insert({
      booking_id: bookingId,
      type: p.type,
      amount: p.amount,
      due_date: p.due_date,
      status: 'pending',
      method: 'bank_transfer',
    });
    if (!error) created++;
  }
  return { created, skipped };
}

/**
 * Erzeugt monatliche Mieten fuer alle aktiven/geplanten Langzeit-Buchungen.
 * Laeuft taeglich per Cron — idempotent durch (booking_id, type='rent', due_date)-Check.
 */
export async function generateMonthlyRentPayments(
  supabase: SupabaseClient<Database>,
  today: string = todayIso(),
): Promise<{ bookingsProcessed: number; paymentsCreated: number }> {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, start_date, end_date, rent_amount')
    .eq('rental_type', 'long_term')
    .in('status', ['planned', 'active'])
    .gt('rent_amount', 0);

  let paymentsCreated = 0;
  let bookingsProcessed = 0;

  for (const b of bookings ?? []) {
    bookingsProcessed++;
    const candidates = nextMonthlyDueDates(b.start_date, today, 2);
    // Buchungen, die schon beendet sind, ueberspringen
    const filtered = candidates.filter(
      (d) => b.end_date === OPEN_END_DATE || d < b.end_date,
    );
    if (!filtered.length) continue;

    const { data: existing } = await supabase
      .from('payments')
      .select('due_date')
      .eq('booking_id', b.id)
      .eq('type', 'rent')
      .in('due_date', filtered);
    const existingDates = new Set((existing ?? []).map((e) => e.due_date));

    for (const due of filtered) {
      if (existingDates.has(due)) continue;
      const { error } = await supabase.from('payments').insert({
        booking_id: b.id,
        type: 'rent',
        amount: b.rent_amount,
        due_date: due,
        status: 'pending',
        method: 'bank_transfer',
      });
      if (!error) paymentsCreated++;
    }
  }

  return { bookingsProcessed, paymentsCreated };
}
