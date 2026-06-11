/**
 * Auto-Drafts fuer Mails — taeglicher Cron erzeugt Entwuerfe,
 * Office sieht sie in der Liste und sendet mit einem Klick (kein
 * Auto-Versand, Annahme #22).
 *
 * Trigger-Regeln:
 *  - welcome           7 Tage vor start_date
 *  - checkin_info      1 Tag vor start_date
 *  - checkout_info     3 Tage vor end_date (nicht bei open-end)
 *  - payment_reminder  Buchung hat ueberfaellige Zahlung UND
 *                      letzter Reminder >= 7 Tage her
 *
 * Idempotenz: pro (booking_id, template_type) wird nur EIN Draft pro
 * Trigger-Fenster erzeugt. Wenn Office einen Draft schon angelegt oder
 * gesendet hat, taucht er nicht doppelt auf.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import type { CommunicationType } from '@/types/aliases';
import { todayIso, addDaysIso, OPEN_END_DATE } from '@/lib/dates';
import { renderForBooking, type ContextExtras } from './render';

// ── Pure helpers (testbar) ─────────────────────────────────────────────

export function shouldGenerateWelcome(startDateIso: string, todayIsoStr: string): boolean {
  return startDateIso === addDaysIso(todayIsoStr, 7);
}

export function shouldGenerateCheckin(startDateIso: string, todayIsoStr: string): boolean {
  return startDateIso === addDaysIso(todayIsoStr, 1);
}

export function shouldGenerateCheckout(
  endDateIso: string,
  todayIsoStr: string,
): boolean {
  if (endDateIso === OPEN_END_DATE) return false; // unbefristet
  return endDateIso === addDaysIso(todayIsoStr, 3);
}

/**
 * Reminder darf nur erneut erzeugt werden wenn der letzte Reminder
 * mindestens MIN_REMINDER_GAP_DAYS her ist.
 *
 * lastReminderAtIso = null → noch nie geschickt → ok
 * lastReminderAtIso vor today−7 → ok
 * sonst → skip
 */
export const MIN_REMINDER_GAP_DAYS = 7;

export function shouldGenerateReminder(
  hasOverduePayment: boolean,
  lastReminderAtIso: string | null,
  todayIsoStr: string,
): boolean {
  if (!hasOverduePayment) return false;
  if (!lastReminderAtIso) return true;
  const cutoff = addDaysIso(todayIsoStr, -MIN_REMINDER_GAP_DAYS);
  return lastReminderAtIso.slice(0, 10) <= cutoff;
}

// ── DB-Orchestrator ────────────────────────────────────────────────────

export interface GenerateDraftsResult {
  welcome: number;
  checkin: number;
  checkout: number;
  reminder: number;
  skipped: number;
}

interface UpcomingBooking {
  id: string;
  start_date: string;
  end_date: string;
  channel_id: string | null;
  tenant_email: string | null;
}

interface OverdueBookingRow {
  booking_id: string;
}

/**
 * Hauptfunktion. Service-Role-Client noetig damit ueber alle Buchungen
 * iteriert werden kann (RLS bypass).
 */
export async function generateUpcomingDrafts(
  supabase: SupabaseClient<Database>,
  today: string = todayIso(),
): Promise<GenerateDraftsResult> {
  const result: GenerateDraftsResult = {
    welcome: 0,
    checkin: 0,
    checkout: 0,
    reminder: 0,
    skipped: 0,
  };

  // Buchungen, die in den naechsten 7 Tagen ein Ereignis haben.
  const horizonEnd = addDaysIso(today, 10);
  const { data: bookings } = await supabase
    .from('bookings')
    .select(
      'id, start_date, end_date, channel_id, tenant:tenants!bookings_tenant_id_fkey(email)',
    )
    .in('status', ['planned', 'active'])
    .or(`start_date.lte.${horizonEnd},end_date.lte.${horizonEnd}`);

  for (const b of bookings ?? []) {
    const tenantEmail = b.tenant?.email ?? null;
    if (!tenantEmail) {
      // Buchung ohne Mail-Adresse fuer den Mieter → keine Drafts
      // (Welcome etc. brauchen jemanden zum Senden). Office sieht es
      // im Booking-Detail und kann manuell editieren.
      continue;
    }
    const upcoming: UpcomingBooking = {
      id: b.id,
      start_date: b.start_date,
      end_date: b.end_date,
      channel_id: b.channel_id,
      tenant_email: tenantEmail,
    };

    if (shouldGenerateWelcome(b.start_date, today)) {
      if (await ensureDraft(supabase, upcoming, 'welcome', today)) {
        result.welcome++;
      } else {
        result.skipped++;
      }
    }
    if (shouldGenerateCheckin(b.start_date, today)) {
      if (await ensureDraft(supabase, upcoming, 'checkin_info', today)) {
        result.checkin++;
      } else {
        result.skipped++;
      }
    }
    if (shouldGenerateCheckout(b.end_date, today)) {
      if (await ensureDraft(supabase, upcoming, 'checkout_info', today)) {
        result.checkout++;
      } else {
        result.skipped++;
      }
    }
  }

  // Payment-Reminder: nicht ueber Buchungen iterieren, sondern direkt
  // die distinct booking_ids aus payments mit status='overdue'.
  const { data: overdueRows } = await supabase
    .from('payments')
    .select('booking_id')
    .eq('status', 'overdue');

  const distinctBookings = new Set(
    (overdueRows ?? []).map((r: OverdueBookingRow) => r.booking_id),
  );

  for (const bookingId of distinctBookings) {
    const { data: lastReminder } = await supabase
      .from('communications')
      .select('created_at')
      .eq('booking_id', bookingId)
      .eq('type', 'payment_reminder')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      !shouldGenerateReminder(
        true,
        lastReminder?.created_at ?? null,
        today,
      )
    ) {
      result.skipped++;
      continue;
    }

    // Brauchen Booking + Tenant-Email
    const { data: b } = await supabase
      .from('bookings')
      .select(
        'id, start_date, end_date, channel_id, tenant:tenants!bookings_tenant_id_fkey(email)',
      )
      .eq('id', bookingId)
      .maybeSingle();
    if (!b || !b.tenant?.email) {
      result.skipped++;
      continue;
    }

    // Aelteste ueberfaellige Zahlung dieser Buchung als Referenz
    const { data: oldest } = await supabase
      .from('payments')
      .select('amount, due_date, reference')
      .eq('booking_id', bookingId)
      .eq('status', 'overdue')
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    const extras: ContextExtras = oldest
      ? {
          paymentAmount: Number(oldest.amount),
          paymentDueDate: oldest.due_date,
          paymentReference: oldest.reference ?? undefined,
        }
      : {};

    const upcoming: UpcomingBooking = {
      id: b.id,
      start_date: b.start_date,
      end_date: b.end_date,
      channel_id: b.channel_id,
      tenant_email: b.tenant.email,
    };

    if (await ensureDraft(supabase, upcoming, 'payment_reminder', today, extras)) {
      result.reminder++;
    } else {
      result.skipped++;
    }
  }

  return result;
}

/**
 * Erzeugt einen Draft fuer (booking, type), wenn nicht schon einer im
 * Trigger-Fenster existiert. Gibt true zurueck wenn neu erzeugt,
 * false wenn schon vorhanden.
 *
 * Trigger-Fenster:
 *  - welcome / checkin_info: keine Communication mit gleichem
 *    (booking_id, type) gestern oder heute
 *  - checkout_info:           keine in den letzten 4 Tagen
 *  - payment_reminder:        durch shouldGenerateReminder schon gecheckt
 */
async function ensureDraft(
  supabase: SupabaseClient<Database>,
  b: UpcomingBooking,
  type: CommunicationType,
  today: string,
  extras: ContextExtras = {},
): Promise<boolean> {
  const windowDays =
    type === 'welcome'
      ? 14 // niemals doppelt: Welcome max 1x pro Buchung
      : type === 'checkin_info' || type === 'checkout_info'
        ? 7
        : 0;

  if (windowDays > 0) {
    const cutoff = addDaysIso(today, -windowDays);
    const { data: existing } = await supabase
      .from('communications')
      .select('id')
      .eq('booking_id', b.id)
      .eq('type', type)
      .gte('created_at', cutoff)
      .limit(1)
      .maybeSingle();
    if (existing) return false;
  }

  const rendered = await renderForBooking(supabase, b.id, type, extras);
  if ('error' in rendered) return false;

  const { data: apartmentRef } = await supabase
    .from('bookings')
    .select('apartment_id')
    .eq('id', b.id)
    .maybeSingle();

  const { error } = await supabase.from('communications').insert({
    booking_id: b.id,
    apartment_id: apartmentRef?.apartment_id ?? null,
    type,
    channel: 'email',
    recipient: rendered.recipient,
    subject: rendered.subject,
    body: rendered.body,
    template_key: type,
    status: 'draft',
  });
  return !error;
}
