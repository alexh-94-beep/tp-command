'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { todayIso } from '@/lib/dates';
import { generatePaymentsForBooking } from '@/services/payments/generate';

// ── Helpers ────────────────────────────────────────────────────────────

function revalidateAll(bookingId?: string, apartmentId?: string) {
  revalidatePath('/payments');
  revalidatePath('/dashboard');
  revalidatePath('/bookings');
  if (bookingId) revalidatePath(`/bookings/${bookingId}`);
  if (apartmentId) revalidatePath(`/apartments/${apartmentId}`);
}

async function loadBookingApartment(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  bookingId: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from('bookings')
    .select('apartment_id')
    .eq('id', bookingId)
    .maybeSingle();
  return data?.apartment_id ?? undefined;
}

// ── createPayment ──────────────────────────────────────────────────────

const createSchema = z.object({
  booking_id: z.string().uuid(),
  type: z.enum([
    'rent',
    'deposit',
    'first_rent',
    'booking_payout',
    'short_term_flat',
    'parking',
    'other',
  ]),
  amount: z.coerce.number().nonnegative(),
  due_date: z.string().min(1, 'Faelligkeit fehlt'),
  method: z
    .enum(['bank_transfer', 'manual_slip', 'booking_payout', 'flatfox', 'card', 'other'])
    .default('bank_transfer'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export async function createPayment(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; paymentId?: string }> {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of ['reference', 'notes']) if (raw[k] === '') delete raw[k];
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Bitte Eingaben pruefen.' };
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: created, error } = await supabase
    .from('payments')
    .insert({
      booking_id: v.booking_id,
      type: v.type,
      amount: v.amount,
      due_date: v.due_date,
      status: 'pending',
      method: v.method,
      reference: v.reference ?? null,
      notes: v.notes ?? null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidateAll(v.booking_id, await loadBookingApartment(supabase, v.booking_id));
  return { ok: true, paymentId: created.id };
}

// ── markPaid / markCancelled / markPending ─────────────────────────────

const markSchema = z.object({
  payment_id: z.string().uuid(),
  paid_date: z.string().optional(),
  reference: z.string().optional(),
});

export async function markPaid(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of ['paid_date', 'reference']) if (raw[k] === '') delete raw[k];
  const parsed = markSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const supabase = await createSupabaseServerClient();

  const { data: payment } = await supabase
    .from('payments')
    .select('booking_id')
    .eq('id', parsed.data.payment_id)
    .maybeSingle();

  const { error } = await supabase
    .from('payments')
    .update({
      status: 'paid',
      paid_date: parsed.data.paid_date ?? todayIso(),
      reference: parsed.data.reference ?? undefined,
    })
    .eq('id', parsed.data.payment_id);
  if (error) return { ok: false, error: error.message };

  revalidateAll(
    payment?.booking_id ?? undefined,
    payment?.booking_id
      ? await loadBookingApartment(supabase, payment.booking_id)
      : undefined,
  );
  return { ok: true };
}

export async function markCancelled(
  paymentId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('booking_id')
    .eq('id', paymentId)
    .maybeSingle();
  const { error } = await supabase
    .from('payments')
    .update({ status: 'cancelled' })
    .eq('id', paymentId);
  if (error) return { ok: false, error: error.message };
  revalidateAll(
    payment?.booking_id ?? undefined,
    payment?.booking_id
      ? await loadBookingApartment(supabase, payment.booking_id)
      : undefined,
  );
  return { ok: true };
}

export async function markPending(
  paymentId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('booking_id')
    .eq('id', paymentId)
    .maybeSingle();
  const { error } = await supabase
    .from('payments')
    .update({ status: 'pending', paid_date: null })
    .eq('id', paymentId);
  if (error) return { ok: false, error: error.message };
  revalidateAll(
    payment?.booking_id ?? undefined,
    payment?.booking_id
      ? await loadBookingApartment(supabase, payment.booking_id)
      : undefined,
  );
  return { ok: true };
}

// ── bulkMarkPaid ───────────────────────────────────────────────────────

export async function bulkMarkPaid(
  paymentIds: string[],
): Promise<{ ok: boolean; updated: number; error?: string }> {
  await requireRole(['admin', 'office']);
  if (!paymentIds.length) return { ok: true, updated: 0 };
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('payments')
    .update({ status: 'paid', paid_date: todayIso() }, { count: 'exact' })
    .in('id', paymentIds)
    .neq('status', 'paid');
  if (error) return { ok: false, updated: 0, error: error.message };
  revalidateAll();
  return { ok: true, updated: count ?? 0 };
}

// ── deletePayment ──────────────────────────────────────────────────────

export async function deletePayment(
  paymentId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('booking_id')
    .eq('id', paymentId)
    .maybeSingle();
  const { error } = await supabase.from('payments').delete().eq('id', paymentId);
  if (error) return { ok: false, error: error.message };
  revalidateAll(
    payment?.booking_id ?? undefined,
    payment?.booking_id
      ? await loadBookingApartment(supabase, payment.booking_id)
      : undefined,
  );
  return { ok: true };
}

// ── regeneratePlannedPayments (manueller Trigger) ──────────────────────

export async function regeneratePlannedPayments(
  bookingId: string,
): Promise<{ ok: boolean; created?: number; skipped?: number; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  try {
    const result = await generatePaymentsForBooking(supabase, bookingId);
    revalidateAll(bookingId, await loadBookingApartment(supabase, bookingId));
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
