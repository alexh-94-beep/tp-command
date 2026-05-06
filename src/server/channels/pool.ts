'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole, getCurrentUser } from '@/lib/auth/session';
import { syncAllChannelPools, syncSingleChannelPool, type PoolSyncResult } from '@/services/channels/sync-pool';
import { suggestApartmentsForReservation, type SuggestionsResult } from '@/services/channels/auto-assign';
import { checkAvailability } from '@/services/availability/check';
import { instantiateBookingTasks } from '@/services/workflow/instantiate';

export async function triggerPoolSync(): Promise<{ ok: boolean; results: PoolSyncResult[]; error?: string }> {
  await requireRole(['admin', 'office']);
  try {
    const results = await syncAllChannelPools();
    revalidatePath('/bookings/pending');
    revalidatePath('/calendar');
    revalidatePath('/dashboard');
    return { ok: true, results };
  } catch (e) {
    return { ok: false, results: [], error: (e as Error).message };
  }
}

export async function triggerSingleChannelPoolSync(channelId: string) {
  await requireRole(['admin', 'office']);
  try {
    const result = await syncSingleChannelPool(channelId);
    revalidatePath('/bookings/pending');
    return { ok: true, result };
  } catch (e) {
    return { ok: false, result: null, error: (e as Error).message };
  }
}

export async function getSuggestions(reservationId: string): Promise<SuggestionsResult | null> {
  await requireRole(['admin', 'office']);
  return suggestApartmentsForReservation(reservationId);
}

const assignSchema = z.object({
  reservation_id: z.string().uuid(),
  apartment_id: z.string().uuid(),
  rent_amount: z.coerce.number().nonnegative().default(0),
  deposit_amount: z.coerce.number().nonnegative().default(0),
});

export async function assignReservation(formData: FormData): Promise<{ ok: boolean; error?: string; bookingId?: string }> {
  await requireRole(['admin', 'office']);
  const user = await getCurrentUser();
  const parsed = assignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: 'Ungültige Eingabe' };

  const { reservation_id, apartment_id, rent_amount, deposit_amount } = parsed.data;
  const supabase = createSupabaseServerClient();

  const { data: reservation } = await supabase
    .from('pending_reservations')
    .select('id, start_date, end_date, summary, description, channel_id, status, external_uid')
    .eq('id', reservation_id)
    .single();
  if (!reservation) return { ok: false, error: 'Reservation nicht gefunden' };
  if (reservation.status !== 'pending') return { ok: false, error: `Status ist bereits ${reservation.status}` };

  // Verfügbarkeits-Check
  const av = await checkAvailability({
    apartmentId: apartment_id,
    startDate: reservation.start_date,
    endDate: reservation.end_date,
  });
  if (!av.available) {
    return {
      ok: false,
      error: `Wohnung ist nicht frei: ${av.conflicts.map((c) => c.label).join(', ')}`,
    };
  }

  // Tenant: Booking-Pool-Gast (gleiche Logik wie sync-ical)
  const channelTenantEmail = `guests+${reservation.channel_id}@tp-command.local`;
  let tenantId: string;
  const { data: existingT } = await supabase
    .from('tenants')
    .select('id')
    .eq('email', channelTenantEmail)
    .maybeSingle();
  if (existingT) {
    tenantId = existingT.id;
  } else {
    const { data: created, error } = await supabase
      .from('tenants')
      .insert({
        tenant_kind: 'guest',
        first_name: 'Pool',
        last_name: '(Booking-Gast)',
        email: channelTenantEmail,
        source: 'booking_com',
      })
      .select('id')
      .single();
    if (error || !created) return { ok: false, error: 'Tenant konnte nicht angelegt werden' };
    tenantId = created.id;
  }

  // Buchung anlegen
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      apartment_id,
      tenant_id: tenantId,
      channel_id: reservation.channel_id,
      rental_type: 'booking',
      external_reference: `pool:${reservation.external_uid}`,
      start_date: reservation.start_date,
      end_date: reservation.end_date,
      rent_amount,
      deposit_amount,
      contract_status: 'signed',
      status: 'planned',
      notes:
        `Pool-Reservation aus ${reservation.channel_id}\nUID: ${reservation.external_uid}` +
        (reservation.summary ? `\nSummary: ${reservation.summary}` : '') +
        (reservation.description ? `\n\n${reservation.description}` : ''),
    })
    .select('id')
    .single();
  if (bookingErr) return { ok: false, error: bookingErr.message };

  // Reservation als zugewiesen markieren
  await supabase
    .from('pending_reservations')
    .update({
      status: 'assigned',
      assigned_booking_id: booking.id,
      assigned_by: user?.id ?? null,
      assigned_at: new Date().toISOString(),
    })
    .eq('id', reservation_id);

  // Workflow-Aufgaben für Booking-Aufenthalt anlegen
  await instantiateBookingTasks(supabase, booking.id);

  revalidatePath('/bookings/pending');
  revalidatePath('/bookings');
  revalidatePath('/calendar');
  revalidatePath(`/apartments/${apartment_id}`);

  return { ok: true, bookingId: booking.id };
}

const channelConfigSchema = z.object({
  channel_id: z.string().uuid(),
  pool_ical_url: z.string().url().or(z.literal('')),
});

export async function saveChannelConfig(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const parsed = channelConfigSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: 'Ungültige Eingabe' };

  const supabase = createSupabaseServerClient();
  const { data: channel } = await supabase
    .from('channels')
    .select('id, config')
    .eq('id', parsed.data.channel_id)
    .single();
  if (!channel) return { ok: false, error: 'Channel nicht gefunden' };

  const cfg = (channel.config ?? {}) as Record<string, unknown>;
  if (parsed.data.pool_ical_url) cfg.pool_ical_url = parsed.data.pool_ical_url;
  else delete cfg.pool_ical_url;

  const { error } = await supabase
    .from('channels')
    .update({ config: cfg })
    .eq('id', parsed.data.channel_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/channels');
  return { ok: true };
}
