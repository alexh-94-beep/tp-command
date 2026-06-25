import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { todayIso } from '@/lib/dates';
import { estimateDurationMinutes } from './duration';
import {
  computeRecurrenceDates,
  defaultRecurrenceHorizon,
  recurrenceCleaningType,
  type CleaningRecurrence,
} from './recurrence';

/**
 * Phase 26d: Erzeugt/aktualisiert die wiederkehrenden Reinigungen einer
 * Buchung passend zum aktuellen `cleaning_recurrence`-Setting.
 *
 *  - Liest cleaning_recurrence + cleaning_recurrence_linen + Daten aus Buchung
 *  - Berechnet Termin-Liste mit Wochenend-Shift
 *  - INSERT fehlende, KEIN Update bestehender (Mireme kann lokal anpassen)
 *  - DELETE noch nicht erledigte Serien-Tasks, deren Datum nicht mehr in
 *    der neuen Liste ist (z.B. nach Frequenz-Wechsel)
 */
export async function applyCleaningRecurrenceForBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<{
  ok: boolean;
  created: number;
  removed: number;
  error?: string;
}> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(
      'id, apartment_id, start_date, end_date, cleaning_recurrence, cleaning_recurrence_linen, notes, apartment:apartments(type), tenant:tenants!bookings_tenant_id_fkey(first_name, last_name)',
    )
    .eq('id', bookingId)
    .single();
  if (error || !booking) {
    return { ok: false, created: 0, removed: 0, error: error?.message };
  }

  const recurrence = booking.cleaning_recurrence as CleaningRecurrence;
  const linen = booking.cleaning_recurrence_linen;
  const type = recurrenceCleaningType(recurrence, linen);

  // Bestehende Serien-Tasks (offen)
  const { data: existing } = await supabase
    .from('cleaning_tasks')
    .select('id, scheduled_date, type, status')
    .eq('booking_id', bookingId)
    .eq('is_recurring', true)
    .in('status', ['open', 'in_progress']);

  // Bei 'none': alle offenen Serien-Tasks loeschen
  if (!type) {
    if (!existing || existing.length === 0) {
      return { ok: true, created: 0, removed: 0 };
    }
    const ids = existing.map((e) => e.id);
    const { error: delErr } = await supabase
      .from('cleaning_tasks')
      .delete()
      .in('id', ids);
    if (delErr) return { ok: false, created: 0, removed: 0, error: delErr.message };
    return { ok: true, created: 0, removed: existing.length };
  }

  // Termine berechnen
  const today = todayIso();
  const dates = computeRecurrenceDates({
    startDate: booking.start_date,
    endDate: booking.end_date,
    recurrence,
    horizonDate: defaultRecurrenceHorizon(today),
  });
  const expectedSet = new Set(dates);
  const existingByDate = new Map(
    (existing ?? []).map((e) => [e.scheduled_date, e]),
  );

  // 1) DELETE: bestehende Serien-Tasks die nicht mehr in der Termin-Liste sind
  //    (z.B. Wechsel von weekly → biweekly), aber nur ZUKÜNFTIGE.
  const toDelete = (existing ?? []).filter(
    (e) =>
      e.scheduled_date > today &&
      (!expectedSet.has(e.scheduled_date) || e.type !== type),
  );
  let removed = 0;
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('cleaning_tasks')
      .delete()
      .in(
        'id',
        toDelete.map((e) => e.id),
      );
    if (!delErr) removed = toDelete.length;
  }

  // 2) INSERT: fehlende Termine. Nur Termine ab heute (keine retroaktiven).
  const aptType = booking.apartment?.type ?? 'senior';
  const minutes = estimateDurationMinutes('own', aptType, type);
  const guestName =
    [booking.tenant?.first_name, booking.tenant?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || null;
  const bookingNote = (booking.notes ?? '').trim() || null;

  const toInsert = dates.filter((d) => {
    if (d < today) return false;
    const e = existingByDate.get(d);
    return !e || e.type !== type;
  });

  let created = 0;
  for (const d of toInsert) {
    const baseHeader = guestName
      ? `Wiederkehrende Reinigung — ${guestName}.`
      : 'Wiederkehrende Reinigung.';
    const notes = bookingNote
      ? `${baseHeader}\n\nNotiz aus Buchung:\n${bookingNote}`
      : baseHeader;
    const { error: insErr } = await supabase.from('cleaning_tasks').insert({
      apartment_id: booking.apartment_id,
      booking_id: booking.id,
      type,
      priority: 'normal',
      status: 'open',
      scheduled_date: d,
      estimated_duration_minutes: minutes,
      linen_change: linen,
      is_recurring: true,
      source: 'own',
      notes,
    });
    if (!insErr) created += 1;
  }

  return { ok: true, created, removed };
}
