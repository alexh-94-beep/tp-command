/**
 * Auto-Zuweisungs-Logik fuer Pool-Reservationen (Booking.com etc).
 *
 * Sortierung (besser → schlechter):
 *   1. Wohnung ist "nur fuer Booking" reserviert (allowed_rental_types == ['booking']) → Pool-Default
 *   2. booking_priority DESC (hoehere Prio zuerst)
 *   3. Geringster Leerstand vorher/nachher (Tetris: kein Aufenthalts-Sandwich verschwenden)
 *
 * Reinigungspuffer: cleaning_buffer_hours der Wohnung wird respektiert.
 * Bei 0 Tagen Gap (Same-Day-Turnover) ist die Wohnung nur verfuegbar wenn
 * der Puffer <= 3 h ist — sonst reicht das Zeitfenster zwischen den Checks
 * nicht fuer die Reinigung.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { dayDiff } from '@/lib/dates';

export interface ApartmentSuggestion {
  apartment_id: string;
  number: string;
  building: string;
  type: string;
  is_pool_default: boolean;
  booking_priority: number;
  cleaning_buffer_hours: number;
  gap_before_days: number | null;
  gap_after_days: number | null;
  total_gap: number;
  available: boolean;
  reason?: string;
}

export interface SuggestionsResult {
  reservation: {
    id: string;
    start_date: string;
    end_date: string;
    summary: string | null;
  };
  suggestions: ApartmentSuggestion[];
}

// ── Pure helpers (testbar) ─────────────────────────────────────────────

/**
 * Prueft, ob der Reinigungspuffer einer Wohnung bei diesem Gap zwischen
 * zwei Stays ausreicht.
 *  - gapDays === null: kein Nachbar → ok
 *  - gapDays >= 1: mind. 1 voller Tag dazwischen → ok (genug Zeit)
 *  - gapDays === 0 (Same-Day-Turnover): nur ok wenn bufferHours <= 3 h
 *    (typisches Booking-Zeitfenster Auszug 11:00 → Einzug 14:00 = 3 h)
 */
export function hasSufficientCleaningBuffer(
  gapDays: number | null,
  bufferHours: number,
): boolean {
  if (gapDays === null) return true;
  if (gapDays >= 1) return true;
  if (gapDays < 0) return false; // Ueberlappung
  return bufferHours <= 3;
}

/**
 * Sortier-Vergleich. Erst verfuegbare, dann pool_default zuerst, dann
 * booking_priority DESC, dann total_gap ASC (Tetris).
 */
export function compareSuggestions(a: ApartmentSuggestion, b: ApartmentSuggestion): number {
  if (a.available !== b.available) return a.available ? -1 : 1;
  if (a.is_pool_default !== b.is_pool_default) return a.is_pool_default ? -1 : 1;
  if (b.booking_priority !== a.booking_priority) return b.booking_priority - a.booking_priority;
  return a.total_gap - b.total_gap;
}

/**
 * Parst einen freitext-Gastnamen in first_name / last_name.
 *  - leer / nur whitespace → generischer Pool-Gast
 *  - genau ein Wort       → ("Müller", "(Ohne Nachname)")
 *  - mehrere Wörter       → letztes Wort = Nachname, Rest = Vorname
 *
 * Wir wollen kein last_name="" in der DB landen, weil tenant.last_name
 * NOT NULL ist und leere Strings im UI als " " gerendert werden.
 */
export function parseGuestName(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return { firstName: 'Pool', lastName: '(Booking-Gast)' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '(Ohne Nachname)' };
  }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function subDaysIso(iso: string, n: number): string {
  return addDaysIso(iso, -n);
}

// ── Service (DB-Orchestrator) ──────────────────────────────────────────

export async function suggestApartmentsForReservation(
  supabase: SupabaseClient<Database>,
  reservationId: string,
): Promise<SuggestionsResult | null> {
  const { data: res } = await supabase
    .from('pending_reservations')
    .select('id, start_date, end_date, summary')
    .eq('id', reservationId)
    .single();
  if (!res) return null;

  const { data: apartments } = await supabase
    .from('apartments')
    .select(
      'id, number, building, type, allowed_rental_types, booking_priority, cleaning_buffer_hours, ownership',
    )
    .neq('ownership', 'sold_external')
    .contains('allowed_rental_types', ['booking'])
    .order('booking_priority', { ascending: false });

  const widenStart = subDaysIso(res.start_date, 90);
  const widenEnd = addDaysIso(res.end_date, 90);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('apartment_id, start_date, end_date, status')
    .in('status', ['planned', 'active'])
    .lt('start_date', widenEnd)
    .gt('end_date', widenStart);

  const { data: blocks } = await supabase
    .from('blocks')
    .select('apartment_id, start_date, end_date')
    .lt('start_date', widenEnd)
    .gt('end_date', widenStart);

  const occByApt = new Map<string, Array<{ start: string; end: string }>>();
  for (const b of bookings ?? []) {
    const arr = occByApt.get(b.apartment_id) ?? [];
    arr.push({ start: b.start_date, end: b.end_date });
    occByApt.set(b.apartment_id, arr);
  }
  for (const bl of blocks ?? []) {
    const arr = occByApt.get(bl.apartment_id) ?? [];
    arr.push({ start: bl.start_date, end: bl.end_date });
    occByApt.set(bl.apartment_id, arr);
  }

  const suggestions: ApartmentSuggestion[] = (apartments ?? []).map((a) => {
    const occ = occByApt.get(a.id) ?? [];
    const overlap = occ.find((o) => o.start < res.end_date && o.end > res.start_date);

    const before = occ
      .filter((o) => o.end <= res.start_date)
      .sort((x, y) => x.end.localeCompare(y.end))
      .pop();
    const gapBefore = before ? dayDiff(before.end, res.start_date) : null;

    const after = occ
      .filter((o) => o.start >= res.end_date)
      .sort((x, y) => x.start.localeCompare(y.start))[0];
    const gapAfter = after ? dayDiff(res.end_date, after.start) : null;

    const total = (gapBefore ?? 999) + (gapAfter ?? 999);

    // Verfuegbarkeit: nicht ueberlappend UND Reinigungspuffer reicht
    let available = !overlap;
    let reason: string | undefined;

    if (overlap) {
      reason = `belegt von ${overlap.start} bis ${overlap.end}`;
    } else if (!hasSufficientCleaningBuffer(gapBefore, a.cleaning_buffer_hours)) {
      available = false;
      reason = `Reinigungspuffer ${a.cleaning_buffer_hours} h reicht nicht (Vor-Stay endet am ${before?.end})`;
    } else if (!hasSufficientCleaningBuffer(gapAfter, a.cleaning_buffer_hours)) {
      available = false;
      reason = `Reinigungspuffer ${a.cleaning_buffer_hours} h reicht nicht (Folge-Stay beginnt am ${after?.start})`;
    }

    return {
      apartment_id: a.id,
      number: a.number,
      building: a.building,
      type: a.type,
      is_pool_default:
        a.allowed_rental_types.length === 1 && a.allowed_rental_types[0] === 'booking',
      booking_priority: a.booking_priority,
      cleaning_buffer_hours: a.cleaning_buffer_hours,
      gap_before_days: gapBefore,
      gap_after_days: gapAfter,
      total_gap: total,
      available,
      reason,
    };
  });

  suggestions.sort(compareSuggestions);

  return {
    reservation: {
      id: res.id,
      start_date: res.start_date,
      end_date: res.end_date,
      summary: res.summary,
    },
    suggestions,
  };
}
