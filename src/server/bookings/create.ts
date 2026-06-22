'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { checkAvailability, type AvailabilityConflict } from '@/services/availability/check';
import { instantiateBookingTasks } from '@/services/workflow/instantiate';
import { ensureCheckoutCleaningForBooking } from '@/services/cleaning/generate';
import { generatePaymentsForBooking } from '@/services/payments/generate';

const OPEN_END = '9999-12-31';

const schema = z.object({
  apartment_id: z.string().uuid('Wohnung wählen'),
  rental_type: z.enum(['long_term', 'short_term', 'booking']),
  channel_id: z.string().uuid().optional().or(z.literal('')),
  external_reference: z.string().optional(),
  start_date: z.string().min(1, 'Einzug fehlt'),
  // Leer = unbefristete Langzeit. Wir mappen auf 9999-12-31.
  end_date: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : OPEN_END)),
  rent_amount: z.coerce.number().nonnegative(),
  deposit_amount: z
    .preprocess(
      (v) => (v === '' || v === undefined ? 0 : v),
      z.coerce.number().nonnegative(),
    )
    .default(0),
  short_term_flat_rate: z.coerce.number().nonnegative().optional(),
  parking_included: z.coerce.boolean().default(false),
  parking_fee: z.coerce.number().nonnegative().optional(),
  contract_status: z.enum(['draft', 'sent', 'signed', 'cancelled']).default('draft'),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']).default('planned'),
  // Phase 25a: Abrechnungsweg, relevant nur fuer short_term. Default w_w.
  invoiced_via: z.enum(['w_w', 'direct']).default('w_w'),
  // Phase 26a: Reinigung ueber W&W abgerechnet? Default true.
  // Bei rental_type='booking' irrelevant.
  cleaning_via_ww: z.coerce.boolean().default(true),
  notes: z.string().optional(),
  // Mieter / Gast (inline)
  tenant_kind: z.enum(['tenant', 'guest']).default('tenant'),
  first_name: z.string().min(1, 'Vorname fehlt'),
  last_name: z.string().min(1, 'Nachname fehlt'),
  email: z.string().email('Gültige E-Mail').optional().or(z.literal('')),
  phone: z.string().optional(),
  source: z
    .enum(['direct', 'flatfox', 'booking_com', 'airbnb', 'expedia', 'website'])
    .default('direct'),
});

export interface CreateBookingResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  conflicts?: AvailabilityConflict[];
}

export async function createBooking(formData: FormData): Promise<CreateBookingResult> {
  const user = await requireRole(['admin', 'office']);

  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  raw.parking_included = formData.has('parking_included');
  // Checkbox: nicht-angekreuzt = field fehlt im FormData komplett.
  raw.cleaning_via_ww = formData.has('cleaning_via_ww');

  for (const k of [
    'channel_id',
    'external_reference',
    'short_term_flat_rate',
    'parking_fee',
    'notes',
    'email',
    'phone',
  ]) {
    if (raw[k] === '') raw[k] = undefined;
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Bitte Eingaben prüfen.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createSupabaseServerClient();
  const v = parsed.data;

  // 1) Verfügbarkeit prüfen
  const availability = await checkAvailability(supabase, {
    apartmentId: v.apartment_id,
    startDate: v.start_date,
    endDate: v.end_date,
  });
  if (!availability.available) {
    return {
      ok: false,
      error: `Wohnung ist im gewählten Zeitraum nicht frei (${availability.conflicts.length} Konflikt(e)).`,
      conflicts: availability.conflicts,
    };
  }

  // 2) Mieter / Gast: Email match oder neu anlegen
  let tenantId: string;
  if (v.email) {
    const { data: existing } = await supabase
      .from('tenants')
      .select('id')
      .eq('email', v.email)
      .maybeSingle();
    if (existing) {
      tenantId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabase
        .from('tenants')
        .insert({
          tenant_kind: v.tenant_kind,
          first_name: v.first_name,
          last_name: v.last_name,
          email: v.email,
          phone: v.phone ?? null,
          source: v.source,
        })
        .select('id')
        .single();
      if (createErr) return { ok: false, error: createErr.message };
      tenantId = created.id;
    }
  } else {
    const { data: created, error: createErr } = await supabase
      .from('tenants')
      .insert({
        tenant_kind: v.tenant_kind,
        first_name: v.first_name,
        last_name: v.last_name,
        phone: v.phone ?? null,
        source: v.source,
      })
      .select('id')
      .single();
    if (createErr) return { ok: false, error: createErr.message };
    tenantId = created.id;
  }

  // 3) Buchung anlegen
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      apartment_id: v.apartment_id,
      tenant_id: tenantId,
      rental_type: v.rental_type,
      channel_id: v.channel_id || null,
      external_reference: v.external_reference ?? null,
      start_date: v.start_date,
      end_date: v.end_date,
      rent_amount: v.rental_type === 'booking' ? 0 : v.rent_amount,
      deposit_amount: v.rental_type === 'booking' ? 0 : v.deposit_amount,
      short_term_flat_rate:
        v.rental_type === 'short_term' ? (v.short_term_flat_rate ?? null) : null,
      parking_included: v.parking_included,
      parking_fee: v.parking_fee ?? null,
      contract_status: v.rental_type === 'booking' ? 'signed' : v.contract_status,
      status: v.status,
      invoiced_via: v.rental_type === 'short_term' ? v.invoiced_via : 'w_w',
      cleaning_via_ww: v.rental_type === 'booking' ? false : v.cleaning_via_ww,
      notes: v.notes ?? null,
    })
    .select('id')
    .single();

  if (bookingErr) {
    if (bookingErr.message.includes('bookings_no_overlap')) {
      return {
        ok: false,
        error:
          'Datenbank meldet Doppelbelegung. Vermutlich wurde parallel eine andere Buchung erfasst – bitte erneut prüfen.',
      };
    }
    return { ok: false, error: bookingErr.message };
  }

  // Audit-Log: Buchung wurde erstellt (Phase 16)
  void (async () => {
    const { logAudit } = await import('@/services/audit/log');
    await logAudit(supabase, {
      actorId: user.id,
      entity: 'booking',
      entityId: booking.id,
      action: 'created',
      diff: {
        apartment_id: v.apartment_id,
        rental_type: v.rental_type,
        start_date: v.start_date,
        end_date: v.end_date,
        status: v.status,
      },
    });
  })();

  // Workflow-Aufgaben aus den Templates instantiieren (Phase 4)
  // Phase 15: Ersteller wird als Default-Assignee fuer office-Tasks bevorzugt
  await instantiateBookingTasks(supabase, booking.id, user.id);

  // Reinigungs-Auftrag fuer Booking-Typ direkt mit-erzeugen (Phase 5):
  // Bei Lang-/Kurzzeit folgt der Auftrag erst, wenn die Wohnungsabnahme
  // geplant/erledigt wird — Datum ist sonst undefiniert (open-end).
  if (v.rental_type === 'booking') {
    await ensureCheckoutCleaningForBooking(supabase, booking.id);
  } else {
    // Phase 15: Auffrischungs-Reinigung wenn Wohnung > 7 Tage leer stand
    try {
      const { ensureRefreshCleaningForBooking } = await import(
        '@/services/cleaning/refresh'
      );
      await ensureRefreshCleaningForBooking(supabase, booking.id);
    } catch (e) {
      console.error('[createBooking] ensureRefreshCleaningForBooking failed:', e);
    }
  }

  // Plan-Zahlungen erzeugen (Phase 8) — Depot + Erst-Miete bei long_term,
  // Pauschale bei short_term, Booking-Payout-Erwartung bei booking.
  // Best-effort: Fehler hier blockieren die Buchung nicht.
  try {
    await generatePaymentsForBooking(supabase, booking.id);
  } catch (e) {
    console.error('[createBooking] generatePaymentsForBooking failed:', e);
  }

  revalidatePath('/bookings');
  revalidatePath('/tasks');
  revalidatePath('/cleaning');
  revalidatePath('/payments');
  revalidatePath('/dashboard');
  revalidatePath(`/apartments/${v.apartment_id}`);

  redirect(`/bookings/${booking.id}`);
}
