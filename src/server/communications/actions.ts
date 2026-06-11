'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { renderForBooking, type ContextExtras } from '@/services/communications/render';
import type { CommunicationType } from '@/types/aliases';

// ── Draft anlegen ──────────────────────────────────────────────────────

const createDraftSchema = z.object({
  booking_id: z.string().uuid(),
  template_key: z.enum([
    'welcome',
    'checkin_info',
    'wifi_info',
    'payment_reminder',
    'checkout_info',
  ]),
  // Optionale extras vom Wizard
  wifi_ssid: z.string().optional(),
  wifi_password: z.string().optional(),
  key_box_code: z.string().optional(),
  payment_due_date: z.string().optional(),
  payment_amount: z.coerce.number().optional(),
  payment_reference: z.string().optional(),
});

export interface CreateDraftResult {
  ok: boolean;
  error?: string;
  communicationId?: string;
}

export async function createDraft(formData: FormData): Promise<CreateDraftResult> {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = createDraftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Bitte Eingaben pruefen.' };
  const v = parsed.data;

  const extras: ContextExtras = {
    wifiSsid: v.wifi_ssid,
    wifiPassword: v.wifi_password,
    keyBoxCode: v.key_box_code,
    paymentDueDate: v.payment_due_date,
    paymentAmount: v.payment_amount,
    paymentReference: v.payment_reference,
  };

  const supabase = await createSupabaseServerClient();
  const rendered = await renderForBooking(
    supabase,
    v.booking_id,
    v.template_key as CommunicationType,
    extras,
  );
  if ('error' in rendered) return { ok: false, error: rendered.error };

  const { data: apartmentRef } = await supabase
    .from('bookings')
    .select('apartment_id')
    .eq('id', v.booking_id)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from('communications')
    .insert({
      booking_id: v.booking_id,
      apartment_id: apartmentRef?.apartment_id ?? null,
      type: v.template_key as CommunicationType,
      channel: 'email',
      recipient: rendered.recipient,
      subject: rendered.subject,
      body: rendered.body,
      template_key: v.template_key,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/bookings/${v.booking_id}`);
  revalidatePath('/communications');
  return { ok: true, communicationId: created.id };
}

// ── Draft updaten (Subject / Body) ─────────────────────────────────────

const updateSchema = z.object({
  communication_id: z.string().uuid(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export async function updateDraft(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const supabase = await createSupabaseServerClient();

  const { data: comm } = await supabase
    .from('communications')
    .select('booking_id, status')
    .eq('id', parsed.data.communication_id)
    .maybeSingle();
  if (!comm) return { ok: false, error: 'Nicht gefunden' };
  if (comm.status !== 'draft') {
    return { ok: false, error: 'Nur Drafts können bearbeitet werden.' };
  }

  const { error } = await supabase
    .from('communications')
    .update({ subject: parsed.data.subject, body: parsed.data.body })
    .eq('id', parsed.data.communication_id);
  if (error) return { ok: false, error: error.message };

  if (comm.booking_id) revalidatePath(`/bookings/${comm.booking_id}`);
  revalidatePath('/communications');
  return { ok: true };
}

// ── Senden via Resend ──────────────────────────────────────────────────

export async function sendDraft(
  communicationId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();

  // Atomarer Claim — verhindert Doppel-Versand bei parallelen Klicks.
  const nowIso = new Date().toISOString();
  const { data: claimed } = await supabase
    .from('communications')
    .update({ status: 'scheduled' })
    .eq('id', communicationId)
    .eq('status', 'draft')
    .select('id, recipient, subject, body, booking_id')
    .maybeSingle();

  if (!claimed) {
    return {
      ok: false,
      error: 'Mail ist nicht (mehr) im Draft-Status. Bitte Liste neu laden.',
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? 'TP-Command <noreply@threepoint.ch>';

  if (!apiKey) {
    // Revert auf draft, damit Office es spaeter erneut versuchen kann.
    await supabase
      .from('communications')
      .update({ status: 'draft' })
      .eq('id', communicationId);
    return {
      ok: false,
      error:
        'RESEND_API_KEY ist nicht konfiguriert. Bitte in den Vercel-Env-Vars hinterlegen.',
    };
  }

  // Resend nur lazy importieren — verhindert dass das Package beim Build
  // ohne Key Probleme macht.
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: claimed.recipient,
    subject: claimed.subject ?? '(ohne Betreff)',
    text: claimed.body ?? '',
  });

  if (result.error) {
    await supabase
      .from('communications')
      .update({ status: 'failed' })
      .eq('id', communicationId);
    if (claimed.booking_id) revalidatePath(`/bookings/${claimed.booking_id}`);
    revalidatePath('/communications');
    return { ok: false, error: `Resend-Fehler: ${result.error.message}` };
  }

  await supabase
    .from('communications')
    .update({ status: 'sent', sent_at: nowIso })
    .eq('id', communicationId);

  if (claimed.booking_id) revalidatePath(`/bookings/${claimed.booking_id}`);
  revalidatePath('/communications');
  return { ok: true };
}

// ── Stornieren / Loeschen ──────────────────────────────────────────────

export async function cancelDraft(
  communicationId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: comm } = await supabase
    .from('communications')
    .select('booking_id')
    .eq('id', communicationId)
    .maybeSingle();
  const { error } = await supabase
    .from('communications')
    .update({ status: 'cancelled' })
    .eq('id', communicationId)
    .in('status', ['draft', 'scheduled', 'failed']);
  if (error) return { ok: false, error: error.message };
  if (comm?.booking_id) revalidatePath(`/bookings/${comm.booking_id}`);
  revalidatePath('/communications');
  return { ok: true };
}

export async function deleteCommunication(
  communicationId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: comm } = await supabase
    .from('communications')
    .select('booking_id, status')
    .eq('id', communicationId)
    .maybeSingle();
  if (comm?.status === 'sent') {
    return { ok: false, error: 'Gesendete Mails koennen nicht geloescht werden.' };
  }
  const { error } = await supabase
    .from('communications')
    .delete()
    .eq('id', communicationId);
  if (error) return { ok: false, error: error.message };
  if (comm?.booking_id) revalidatePath(`/bookings/${comm.booking_id}`);
  revalidatePath('/communications');
  return { ok: true };
}
