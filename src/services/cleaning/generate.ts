/**
 * Erzeugung von Reinigungs-Aufträgen.
 *
 * Booking-Buchung:    Auftrag am end_date um check_out_time (default 11:00)
 * Lang-/Kurzzeit:     Wenn handover_planned_at gesetzt → Plan-Zeit + 1 h Puffer
 *                     Wenn handover_completed_at gesetzt (ohne Plan)  → jetzt + 1 h
 */
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { addDaysIso, todayIso } from '@/lib/dates';
import { estimateDurationMinutes, type CleaningSource } from './duration';

export interface GenerateResult {
  created_for_booking: number;
  created_for_handover: number;
  errors: string[];
}

interface ScheduleSlot {
  date: string;            // ISO YYYY-MM-DD
  windowRange: string;     // Postgres tstzrange-Literal "[start,end)"
}

/** Postgres tstzrange-Format: '2026-05-01 11:00:00+02' (ohne T, Offset ohne ':') */
function pgTimestamp(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  // Lokale TZ-Offset in Minuten → ±HH
  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? '+' : '-';
  const tzh = String(Math.floor(Math.abs(tzMin) / 60)).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:00${sign}${tzh}`;
}

function deriveSlot(b: {
  rental_type: string;
  end_date: string;
  check_out_time: string | null;
  handover_planned_at: string | null;
  handover_completed_at: string | null;
}): ScheduleSlot {
  let startDate: Date;

  if (b.handover_planned_at) {
    startDate = new Date(b.handover_planned_at);
    startDate.setHours(startDate.getHours() + 1);
  } else if (b.handover_completed_at) {
    startDate = new Date(b.handover_completed_at);
    startDate.setHours(startDate.getHours() + 1);
  } else {
    // Booking / sonst: end_date + check_out_time
    const time = b.check_out_time ?? (b.rental_type === 'booking' ? '11:00' : '14:00');
    const [h, m] = time.split(':');
    startDate = new Date(`${b.end_date}T${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}:00`);
  }

  const endDate = new Date(startDate);
  endDate.setHours(endDate.getHours() + 4);

  const dateIso = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(
    startDate.getDate(),
  ).padStart(2, '0')}`;

  return {
    date: dateIso,
    windowRange: `[${pgTimestamp(startDate)},${pgTimestamp(endDate)})`,
  };
}

export async function ensureCheckoutCleaningForBooking(bookingId: string): Promise<{
  ok: boolean;
  cleaning_task_id?: string;
  action?: 'created' | 'updated' | 'unchanged';
  error?: string;
}> {
  const supabase = createSupabaseServerClient();
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(
      'id, apartment_id, end_date, check_out_time, rental_type, handover_planned_at, handover_completed_at, apartment:apartments(type)',
    )
    .eq('id', bookingId)
    .single();
  if (error || !booking) return { ok: false, error: error?.message ?? 'Buchung nicht gefunden' };

  const aptType = (booking.apartment as { type?: string } | null)?.type ?? 'senior';
  const source: CleaningSource = booking.rental_type === 'booking' ? 'booking' : 'own';
  const minutes = estimateDurationMinutes(source, aptType, 'checkout');

  const slot = deriveSlot(booking);

  // Existierender Auftrag (nicht abgeschlossen)
  const { data: existing } = await supabase
    .from('cleaning_tasks')
    .select('id, scheduled_date, scheduled_window, status')
    .eq('booking_id', bookingId)
    .eq('type', 'checkout')
    .neq('status', 'quality_checked')
    .maybeSingle();

  if (existing) {
    // Auftrag updaten, wenn sich Datum/Fenster geändert hat und noch nicht erledigt
    if (existing.status === 'open' || existing.status === 'in_progress') {
      const newWindow = slot.windowRange;
      if (existing.scheduled_date !== slot.date || existing.scheduled_window !== newWindow) {
        const { error: upErr } = await supabase
          .from('cleaning_tasks')
          .update({ scheduled_date: slot.date, scheduled_window: newWindow })
          .eq('id', existing.id);
        if (upErr) return { ok: false, error: upErr.message };
        return { ok: true, cleaning_task_id: existing.id, action: 'updated' };
      }
    }
    return { ok: true, cleaning_task_id: existing.id, action: 'unchanged' };
  }

  // Neuer Auftrag
  const { data: created, error: createErr } = await supabase
    .from('cleaning_tasks')
    .insert({
      apartment_id: booking.apartment_id,
      booking_id: booking.id,
      type: 'checkout',
      priority: booking.rental_type === 'booking' ? 'high' : 'normal',
      status: 'open',
      scheduled_date: slot.date,
      scheduled_window: slot.windowRange,
      estimated_duration_minutes: minutes,
      notes:
        booking.handover_planned_at
          ? `Geplant für nach Wohnungsabnahme um ${formatTime(booking.handover_planned_at)}.`
          : booking.handover_completed_at
            ? `Erzeugt nach erledigter Abnahme.`
            : `Auszug ${booking.rental_type === 'booking' ? 'Booking' : 'Mieter'}.`,
    })
    .select('id')
    .single();

  if (createErr) return { ok: false, error: createErr.message };
  return { ok: true, cleaning_task_id: created.id, action: 'created' };
}

/** Storniert einen offenen Auftrag, wenn der Plan rückgängig gemacht wird. */
export async function cancelCheckoutCleaningForBooking(bookingId: string) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('cleaning_tasks')
    .delete()
    .eq('booking_id', bookingId)
    .eq('type', 'checkout')
    .eq('status', 'open');
  return { ok: !error, error: error?.message };
}

export async function generateUpcomingCleanings(): Promise<GenerateResult> {
  const supabase = createSupabaseServerClient();
  const result: GenerateResult = { created_for_booking: 0, created_for_handover: 0, errors: [] };

  const horizon = addDaysIso(todayIso(), 14);

  // 1) Booking-Auszüge in den nächsten 14 Tagen
  const { data: bookingAuszuege } = await supabase
    .from('bookings')
    .select('id, end_date, rental_type')
    .in('status', ['active', 'planned'])
    .eq('rental_type', 'booking')
    .gte('end_date', todayIso())
    .lte('end_date', horizon);
  for (const b of bookingAuszuege ?? []) {
    const r = await ensureCheckoutCleaningForBooking(b.id);
    if (r.ok && (r.action === 'created' || r.action === 'updated')) result.created_for_booking++;
    else if (!r.ok) result.errors.push(`Booking ${b.id}: ${r.error}`);
  }

  // 2) Lang-/Kurzzeit-Buchungen mit geplanter oder erledigter Abnahme
  const { data: handovers } = await supabase
    .from('bookings')
    .select('id')
    .or('handover_planned_at.not.is.null,handover_completed_at.not.is.null')
    .neq('rental_type', 'booking');
  for (const b of handovers ?? []) {
    const r = await ensureCheckoutCleaningForBooking(b.id);
    if (r.ok && (r.action === 'created' || r.action === 'updated')) result.created_for_handover++;
    else if (!r.ok) result.errors.push(`Handover ${b.id}: ${r.error}`);
  }

  return result;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('de-CH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}
