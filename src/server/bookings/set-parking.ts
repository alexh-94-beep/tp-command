'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole, getCurrentUser } from '@/lib/auth/session';

/**
 * Phase 23a: Mireme beantwortet die "Parkplatz benoetigt?"-Task direkt
 * via Toggle. Setzt bookings.parking_included und reaktiviert die
 * conditional Tasks (parking_assign, parking_notify, license_plate).
 *
 * - true  → parking_included=true, conditional Tasks von 'na' → 'open'
 * - false → parking_included=false, conditional Tasks von 'open' → 'na'
 *   (bereits abgeschlossene Tasks bleiben unangetastet)
 * - In beiden Faellen wird booking_parking_check selbst auf 'done' gesetzt.
 */
const schema = z.object({
  booking_id: z.string().uuid(),
  needed: z.coerce.boolean(),
});

const CONDITIONAL_CODES = [
  'booking_parking_assign',
  'booking_parking_notify',
  'booking_license_plate',
];

export async function setBookingParking(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'cleaning']);
  const actor = await getCurrentUser();
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  raw.needed = raw.needed === 'true' || raw.needed === '1';
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const { booking_id, needed } = parsed.data;

  const supabase = await createSupabaseServerClient();

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, parking_included')
    .eq('id', booking_id)
    .single();
  if (bErr || !booking) return { ok: false, error: 'Buchung nicht gefunden' };

  // 1) parking_included setzen
  if (booking.parking_included !== needed) {
    const { error: updErr } = await supabase
      .from('bookings')
      .update({ parking_included: needed })
      .eq('id', booking_id);
    if (updErr) return { ok: false, error: updErr.message };
  }

  // 2) booking_parking_check abschliessen
  await supabase
    .from('booking_tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      completed_by: actor?.id ?? null,
    })
    .eq('booking_id', booking_id)
    .eq('code', 'booking_parking_check')
    .neq('status', 'done');

  // 3) Conditional Tasks reaktivieren / wieder na
  if (needed) {
    // 'na' → 'open' fuer alle parking-conditional Tasks
    await supabase
      .from('booking_tasks')
      .update({ status: 'open' })
      .eq('booking_id', booking_id)
      .in('code', CONDITIONAL_CODES)
      .eq('status', 'na');
  } else {
    // 'open' → 'na' (nicht 'done' anfassen)
    await supabase
      .from('booking_tasks')
      .update({ status: 'na' })
      .eq('booking_id', booking_id)
      .in('code', CONDITIONAL_CODES)
      .eq('status', 'open');
  }

  void (async () => {
    const { logAudit } = await import('@/services/audit/log');
    await logAudit(supabase, {
      actorId: actor?.id ?? null,
      entity: 'booking',
      entityId: booking_id,
      action: 'updated',
      diff: {
        parking_included: { before: booking.parking_included, after: needed },
        _note: 'Parkplatz-Antwort via Mireme-Task',
      },
    });
  })();

  revalidatePath(`/bookings/${booking_id}`);
  return { ok: true };
}
