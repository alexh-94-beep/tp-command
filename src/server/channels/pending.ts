'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole, getCurrentUser } from '@/lib/auth/session';
import {
  suggestApartmentsForReservation,
  type SuggestionsResult,
} from '@/services/channels/auto-assign';
import { checkAvailability } from '@/services/availability/check';
import { instantiateBookingTasks } from '@/services/workflow/instantiate';
import { ensureCheckoutCleaningForBooking } from '@/services/cleaning/generate';

// ── Manuelle Eingabe einer Pool-Reservation ──────────────────────────

const createSchema = z.object({
  channel_code: z.enum(['booking_com', 'airbnb', 'expedia', 'website']),
  external_uid: z.string().min(1, 'Buchungsnummer fehlt'),
  start_date: z.string().min(1, 'Einzug fehlt'),
  end_date: z.string().min(1, 'Auszug fehlt'),
  summary: z.string().optional(),
  description: z.string().optional(),
  guest_count: z.coerce.number().int().positive().nullable().optional(),
});

export interface CreatePendingResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  reservationId?: string;
}

export async function createPendingReservation(
  formData: FormData,
): Promise<CreatePendingResult> {
  await requireRole(['admin', 'office']);

  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of ['summary', 'description', 'guest_count']) {
    if (raw[k] === '') delete raw[k];
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Bitte Eingaben prüfen.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  if (v.end_date <= v.start_date) {
    return { ok: false, error: 'Auszug muss nach Einzug liegen.' };
  }

  const supabase = await createSupabaseServerClient();

  // Channel-ID aus dem code holen
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('code', v.channel_code)
    .maybeSingle();
  if (!channel) {
    return { ok: false, error: `Channel "${v.channel_code}" nicht konfiguriert.` };
  }

  // Doppelte external_uid pro Channel verhindern (UNIQUE-Constraint faengt das auch)
  const { data: existing } = await supabase
    .from('pending_reservations')
    .select('id, status')
    .eq('channel_id', channel.id)
    .eq('external_uid', v.external_uid)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: `Diese Buchungs-Nr existiert bereits als Pool-Reservation (Status: ${existing.status}).`,
    };
  }

  const { data: created, error } = await supabase
    .from('pending_reservations')
    .insert({
      channel_id: channel.id,
      external_uid: v.external_uid,
      start_date: v.start_date,
      end_date: v.end_date,
      summary: v.summary ?? null,
      description: v.description ?? null,
      guest_count: v.guest_count ?? null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/bookings/pending');
  revalidatePath('/bookings');
  return { ok: true, reservationId: created.id };
}

// ── Suggestions + Assign + Cancel ────────────────────────────────────

export async function getSuggestions(
  reservationId: string,
): Promise<SuggestionsResult | null> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  return suggestApartmentsForReservation(supabase, reservationId);
}

const assignSchema = z.object({
  reservation_id: z.string().uuid(),
  apartment_id: z.string().uuid(),
  rent_amount: z.coerce.number().nonnegative().default(0),
  deposit_amount: z.coerce.number().nonnegative().default(0),
  guest_name: z.string().optional(),
});

export async function assignReservation(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; bookingId?: string }> {
  await requireRole(['admin', 'office']);
  const user = await getCurrentUser();

  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  if (raw.guest_name === '') delete raw.guest_name;

  const parsed = assignSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungültige Eingabe' };

  const { reservation_id, apartment_id, rent_amount, deposit_amount, guest_name } =
    parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: reservation } = await supabase
    .from('pending_reservations')
    .select(
      'id, start_date, end_date, summary, description, channel_id, status, external_uid',
    )
    .eq('id', reservation_id)
    .single();
  if (!reservation) return { ok: false, error: 'Reservation nicht gefunden' };
  if (reservation.status !== 'pending') {
    return { ok: false, error: `Status ist bereits ${reservation.status}` };
  }

  const av = await checkAvailability(supabase, {
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

  // Tenant: Booking-Gast mit Namen (falls eingegeben) oder generisches Pool-Profil
  let tenantId: string;
  if (guest_name && guest_name.trim()) {
    const parts = guest_name.trim().split(/\s+/);
    const firstName = parts.slice(0, -1).join(' ') || parts[0];
    const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
    const { data: created, error } = await supabase
      .from('tenants')
      .insert({
        tenant_kind: 'guest',
        first_name: firstName,
        last_name: lastName || '(Booking-Gast)',
        source: 'booking_com',
      })
      .select('id')
      .single();
    if (error || !created)
      return { ok: false, error: `Gast-Profil konnte nicht angelegt werden: ${error?.message}` };
    tenantId = created.id;
  } else {
    const channelTenantEmail = `guests+${reservation.channel_id}@tp-command.local`;
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
      if (error || !created)
        return { ok: false, error: 'Tenant konnte nicht angelegt werden' };
      tenantId = created.id;
    }
  }

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
        `Pool-Reservation aus Channel ${reservation.channel_id}\nReferenz: ${reservation.external_uid}` +
        (reservation.summary ? `\nGast: ${reservation.summary}` : '') +
        (reservation.description ? `\n\n${reservation.description}` : ''),
    })
    .select('id')
    .single();
  if (bookingErr) return { ok: false, error: bookingErr.message };

  await supabase
    .from('pending_reservations')
    .update({
      status: 'assigned',
      assigned_booking_id: booking.id,
      assigned_by: user?.id ?? null,
      assigned_at: new Date().toISOString(),
    })
    .eq('id', reservation_id);

  await instantiateBookingTasks(supabase, booking.id);
  await ensureCheckoutCleaningForBooking(supabase, booking.id);

  revalidatePath('/bookings/pending');
  revalidatePath('/bookings');
  revalidatePath('/calendar');
  revalidatePath('/cleaning');
  revalidatePath(`/apartments/${apartment_id}`);

  return { ok: true, bookingId: booking.id };
}

export async function cancelPendingReservation(
  reservationId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('pending_reservations')
    .update({ status: 'cancelled' })
    .eq('id', reservationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/bookings/pending');
  revalidatePath('/bookings');
  return { ok: true };
}
