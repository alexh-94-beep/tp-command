'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { checkAvailability, type AvailabilityConflict } from '@/services/availability/check';
import {
  instantiateBookingTasks,
  recomputeBookingTaskDueDates,
} from '@/services/workflow/instantiate';

const OPEN_END = '9999-12-31';

const schema = z.object({
  id: z.string().uuid(),
  rental_type: z.enum(['long_term', 'short_term', 'booking']),
  start_date: z.string().min(1, 'Einzug fehlt'),
  end_date: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : OPEN_END)),
  rent_amount: z.coerce.number().nonnegative(),
  deposit_amount: z.coerce.number().nonnegative().default(0),
  short_term_flat_rate: z.coerce.number().nonnegative().nullable().optional(),
  parking_included: z.coerce.boolean().default(false),
  parking_fee: z.coerce.number().nonnegative().nullable().optional(),
  contract_status: z.enum(['draft', 'sent', 'signed', 'cancelled']),
  status: z.enum(['planned', 'active', 'completed', 'cancelled']),
  check_in_status: z.enum(['pending', 'completed']),
  check_out_status: z.enum(['pending', 'completed']),
  external_reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export interface UpdateBookingResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  conflicts?: AvailabilityConflict[];
}

export async function updateBooking(formData: FormData): Promise<UpdateBookingResult> {
  await requireRole(['admin', 'office']);

  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  raw.parking_included = formData.has('parking_included');

  for (const k of ['short_term_flat_rate', 'parking_fee', 'external_reference', 'notes']) {
    if (raw[k] === '') raw[k] = null;
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Bitte Eingaben prüfen.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const v = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: existErr } = await supabase
    .from('bookings')
    .select('id, apartment_id, status')
    .eq('id', v.id)
    .single();
  if (existErr || !existing) return { ok: false, error: 'Buchung nicht gefunden.' };

  // Verfuegbarkeits-Check (eigene Buchung ignorieren) – nur wenn nicht storniert
  if (v.status !== 'cancelled') {
    const av = await checkAvailability(supabase, {
      apartmentId: existing.apartment_id,
      startDate: v.start_date,
      endDate: v.end_date,
      ignoreBookingId: v.id,
    });
    if (!av.available) {
      return {
        ok: false,
        error: `Wohnung im neuen Zeitraum nicht frei (${av.conflicts.length} Konflikt(e)).`,
        conflicts: av.conflicts,
      };
    }
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      rental_type: v.rental_type,
      start_date: v.start_date,
      end_date: v.end_date,
      rent_amount: v.rent_amount,
      deposit_amount: v.deposit_amount,
      short_term_flat_rate: v.short_term_flat_rate ?? null,
      parking_included: v.parking_included,
      parking_fee: v.parking_fee ?? null,
      contract_status: v.contract_status,
      status: v.status,
      check_in_status: v.check_in_status,
      check_out_status: v.check_out_status,
      external_reference: v.external_reference ?? null,
      notes: v.notes ?? null,
    })
    .eq('id', v.id);

  if (updateErr) {
    if (updateErr.message.includes('bookings_no_overlap')) {
      return { ok: false, error: 'Datenbank meldet Doppelbelegung. Bitte erneut prüfen.' };
    }
    return { ok: false, error: updateErr.message };
  }

  // Workflow-Aufgaben (Phase 4):
  // - fehlende Schritte ergaenzen (z.B. wenn Mietart gewechselt wurde)
  // - Faelligkeitsdaten der offenen Aufgaben neu berechnen
  await instantiateBookingTasks(supabase, v.id);
  await recomputeBookingTaskDueDates(supabase, v.id);

  revalidatePath('/bookings');
  revalidatePath('/tasks');
  revalidatePath(`/bookings/${v.id}`);
  revalidatePath(`/apartments/${existing.apartment_id}`);
  revalidatePath('/dashboard');

  redirect(`/bookings/${v.id}`);
}

export async function cancelBooking(
  bookingId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', contract_status: 'cancelled' })
    .eq('id', bookingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/bookings');
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/dashboard');
  return { ok: true };
}
