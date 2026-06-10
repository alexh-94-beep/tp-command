'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole, getCurrentUser } from '@/lib/auth/session';
import {
  suggestApartmentsForReservation,
  parseGuestName,
  type SuggestionsResult,
} from '@/services/channels/auto-assign';
import { checkAvailability } from '@/services/availability/check';
import { instantiateBookingTasks } from '@/services/workflow/instantiate';
import { ensureCheckoutCleaningForBooking } from '@/services/cleaning/generate';
import { generatePaymentsForBooking } from '@/services/payments/generate';

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
): Promise<{ ok: boolean; error?: string; warning?: string; bookingId?: string }> {
  await requireRole(['admin', 'office']);
  const user = await getCurrentUser();

  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  if (raw.guest_name === '') delete raw.guest_name;

  const parsed = assignSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungültige Eingabe' };

  const { reservation_id, apartment_id, rent_amount, deposit_amount, guest_name } =
    parsed.data;
  const supabase = await createSupabaseServerClient();

  // Step 1: Atomarer Claim. Statusübergang pending → assigned läuft DIREKT
  // hier per conditional update. Wenn 0 Zeilen betroffen sind, hat jemand
  // anderes die Reservation parallel zugewiesen oder storniert.
  // Wir setzen den booking_id erst später, wenn die Buchung wirklich steht.
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await supabase
    .from('pending_reservations')
    .update({
      status: 'assigned',
      assigned_by: user?.id ?? null,
      assigned_at: nowIso,
    })
    .eq('id', reservation_id)
    .eq('status', 'pending')
    .select(
      'id, start_date, end_date, summary, description, channel_id, external_uid',
    )
    .maybeSingle();

  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) {
    return {
      ok: false,
      error: 'Reservation wurde bereits zugewiesen oder storniert. Bitte Liste neu laden.',
    };
  }

  const reservation = claimed;

  // Rollback-Helfer: setzt die Reservation zurück auf "pending"
  // wenn irgendein nachgelagerter Schritt fehlschlaegt.
  const revertClaim = async (reason: string) => {
    await supabase
      .from('pending_reservations')
      .update({ status: 'pending', assigned_by: null, assigned_at: null })
      .eq('id', reservation_id);
    return { ok: false as const, error: reason };
  };

  // Step 2: Availability-Vorpruefung (das EXCLUDE-Constraint auf bookings
  // bleibt der eigentliche Schutz, aber wir wollen einen sprechenden Fehler).
  const av = await checkAvailability(supabase, {
    apartmentId: apartment_id,
    startDate: reservation.start_date,
    endDate: reservation.end_date,
  });
  if (!av.available) {
    return revertClaim(
      `Wohnung ist nicht frei: ${av.conflicts.map((c) => c.label).join(', ')}`,
    );
  }

  // Step 3: Tenant erstellen (oder bestehenden Pool-Tenant wiederverwenden)
  let tenantId: string;
  if (guest_name && guest_name.trim()) {
    const { firstName, lastName } = parseGuestName(guest_name);
    const { data: created, error } = await supabase
      .from('tenants')
      .insert({
        tenant_kind: 'guest',
        first_name: firstName,
        last_name: lastName,
        source: 'booking_com',
      })
      .select('id')
      .single();
    if (error || !created) {
      return revertClaim(
        `Gast-Profil konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`,
      );
    }
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
      if (error || !created) {
        return revertClaim(`Tenant konnte nicht angelegt werden: ${error?.message ?? ''}`);
      }
      tenantId = created.id;
    }
  }

  // Step 4: Buchung anlegen. Wenn der DB-Exclude-Constraint zuschlaegt
  // (echte Race mit einer parallelen Buchung), gibt es hier einen Fehler
  // und wir rollen den Claim zurueck.
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
  if (bookingErr || !booking) {
    return revertClaim(
      `Buchung konnte nicht angelegt werden: ${bookingErr?.message ?? 'unbekannt'}`,
    );
  }

  // Step 5: pending_reservation mit der Booking-ID verknuepfen.
  await supabase
    .from('pending_reservations')
    .update({ assigned_booking_id: booking.id })
    .eq('id', reservation_id);

  // Step 6: Workflow-Aufgaben + Checkout-Reinigung. Fehler hier sind
  // nicht-kritisch — die Buchung steht. Wir geben aber eine Warnung
  // zurueck, damit Office das nachziehen kann.
  let warning: string | undefined;
  try {
    await instantiateBookingTasks(supabase, booking.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[assignReservation] instantiateBookingTasks failed:', msg);
    warning = `Workflow-Aufgaben konnten nicht erzeugt werden: ${msg}`;
  }
  try {
    await ensureCheckoutCleaningForBooking(supabase, booking.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[assignReservation] ensureCheckoutCleaning failed:', msg);
    warning = warning
      ? `${warning} | Checkout-Reinigung konnte nicht angelegt werden: ${msg}`
      : `Checkout-Reinigung konnte nicht angelegt werden: ${msg}`;
  }
  try {
    await generatePaymentsForBooking(supabase, booking.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[assignReservation] generatePaymentsForBooking failed:', msg);
    warning = warning
      ? `${warning} | Plan-Zahlungen konnten nicht erzeugt werden: ${msg}`
      : `Plan-Zahlungen konnten nicht erzeugt werden: ${msg}`;
  }

  revalidatePath('/bookings/pending');
  revalidatePath('/bookings');
  revalidatePath('/calendar');
  revalidatePath('/cleaning');
  revalidatePath('/payments');
  revalidatePath(`/apartments/${apartment_id}`);

  return { ok: true, bookingId: booking.id, warning };
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
