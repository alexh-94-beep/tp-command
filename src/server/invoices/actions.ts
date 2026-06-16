'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole, getCurrentUser } from '@/lib/auth/session';

// Standard-Adresse aus Wohnung ableiten
function apartmentDefaultAddress(number: string): string {
  const building = number.split('.')[0];
  const buildingAddress: Record<string, string> = {
    C: 'Tower C, Stettbachstrasse 14, 8600 Dübendorf',
    D: 'Tower D, Stettbachstrasse 14, 8600 Dübendorf',
    E: 'Tower E, Stettbachstrasse 14, 8600 Dübendorf',
  };
  return buildingAddress[building] ?? 'Stettbachstrasse 14, 8600 Dübendorf';
}

// ── Draft anlegen (ohne Pflichtfelder) ────────────────────────────────

export async function createInvoiceDraft(): Promise<{
  ok: boolean;
  error?: string;
  invoiceId?: string;
}> {
  await requireRole(['admin', 'office', 'management']);
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const { data: created, error } = await supabase
    .from('debitor_invoices')
    .insert({
      status: 'draft',
      created_by: user?.id ?? null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/invoices');
  return { ok: true, invoiceId: created.id };
}

// ── Update (in Draft frei, in final nicht) ────────────────────────────

const updateSchema = z.object({
  invoice_id: z.string().uuid(),
  last_name: z.string().optional(),
  first_name: z.string().optional(),
  address: z.string().optional(),
  apartment_id: z.string().uuid().optional(),
  apartment_id_clear: z.string().optional(), // '1' → setzt apartment_id=null
  service_date: z.string().optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
  amount_chf: z.coerce.number().optional(),
  attachment_url: z.string().optional(),
  attachment_name: z.string().optional(),
});

export async function updateInvoice(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'management']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const supabase = await createSupabaseServerClient();

  const { data: current } = await supabase
    .from('debitor_invoices')
    .select('status')
    .eq('id', parsed.data.invoice_id)
    .maybeSingle();
  if (!current) return { ok: false, error: 'Rechnung nicht gefunden' };
  if (current.status !== 'draft') {
    return { ok: false, error: 'Nur Entwürfe können bearbeitet werden.' };
  }

  const { invoice_id, apartment_id_clear, ...patch } = parsed.data;
  const update: {
    last_name?: string;
    first_name?: string;
    address?: string;
    apartment_id?: string | null;
    service_date?: string;
    subject?: string;
    description?: string;
    amount_chf?: number;
    attachment_url?: string;
    attachment_name?: string;
  } = { ...patch };
  if (apartment_id_clear === '1') update.apartment_id = null;

  const { error } = await supabase
    .from('debitor_invoices')
    .update(update)
    .eq('id', invoice_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${invoice_id}`);
  return { ok: true };
}

// ── Default-Adresse aus Wohnung uebernehmen ───────────────────────────

export async function applyApartmentAddress(
  invoiceId: string,
): Promise<{ ok: boolean; error?: string; address?: string }> {
  await requireRole(['admin', 'office', 'management']);
  const supabase = await createSupabaseServerClient();
  const { data: inv } = await supabase
    .from('debitor_invoices')
    .select('apartment_id, status, apartment:apartments(number)')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: 'Rechnung nicht gefunden' };
  if (inv.status !== 'draft') {
    return { ok: false, error: 'Nur im Entwurf möglich.' };
  }
  if (!inv.apartment?.number) {
    return { ok: false, error: 'Keine Wohnung gewählt.' };
  }
  const address = `${inv.apartment.number}, ${apartmentDefaultAddress(inv.apartment.number)}`;
  const { error } = await supabase
    .from('debitor_invoices')
    .update({ address })
    .eq('id', invoiceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true, address };
}

// ── Auf 'final' setzen (Pflichtfelder-Check) ──────────────────────────

const finalRequired = z.object({
  last_name: z.string().min(1),
  first_name: z.string().min(1),
  address: z.string().min(1),
  service_date: z.string().min(1),
  subject: z.string().min(1),
  description: z.string().min(1),
  amount_chf: z.number().positive(),
});

export async function setInvoiceFinal(
  invoiceId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'management']);
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const { data: inv } = await supabase
    .from('debitor_invoices')
    .select(
      'status, last_name, first_name, address, service_date, subject, description, amount_chf',
    )
    .eq('id', invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: 'Rechnung nicht gefunden' };
  if (inv.status !== 'draft') {
    return { ok: false, error: 'Nur Entwürfe können finalisiert werden.' };
  }
  const parsed = finalRequired.safeParse({
    last_name: inv.last_name ?? '',
    first_name: inv.first_name ?? '',
    address: inv.address ?? '',
    service_date: inv.service_date ?? '',
    subject: inv.subject ?? '',
    description: inv.description ?? '',
    amount_chf: Number(inv.amount_chf ?? 0),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        'Bitte alle Pflichtfelder ausfüllen: Name, Vorname, Adresse, Datum, Betreff, Beschreibung, Betrag > 0.',
    };
  }
  const { error } = await supabase
    .from('debitor_invoices')
    .update({
      status: 'final',
      finalized_at: new Date().toISOString(),
      finalized_by: user?.id ?? null,
    })
    .eq('id', invoiceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/invoices');
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

export async function revertInvoiceToDraft(
  invoiceId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'management']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('debitor_invoices')
    .update({
      status: 'draft',
      finalized_at: null,
      finalized_by: null,
    })
    .eq('id', invoiceId)
    .eq('status', 'final');
  if (error) return { ok: false, error: error.message };
  revalidatePath('/invoices');
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

// ── Auf 'created' setzen (Sharon hat die echte Rechnung erstellt) ─────

const createdSchema = z.object({
  invoice_id: z.string().uuid(),
  invoice_number: z.string().optional(),
});

export async function setInvoiceCreated(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'management']);
  const user = await getCurrentUser();
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = createdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('debitor_invoices')
    .update({
      status: 'created',
      invoiced_at: new Date().toISOString(),
      invoiced_by: user?.id ?? null,
      invoice_number: parsed.data.invoice_number ?? null,
    })
    .eq('id', parsed.data.invoice_id)
    .in('status', ['final']);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/invoices');
  revalidatePath(`/invoices/${parsed.data.invoice_id}`);
  return { ok: true };
}

// ── Loeschen ──────────────────────────────────────────────────────────

export async function deleteInvoice(
  invoiceId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'management']);
  const supabase = await createSupabaseServerClient();
  const { data: inv } = await supabase
    .from('debitor_invoices')
    .select('status')
    .eq('id', invoiceId)
    .maybeSingle();
  if (inv?.status === 'created') {
    return { ok: false, error: 'Erstellte Rechnungen können nicht gelöscht werden.' };
  }
  const { error } = await supabase
    .from('debitor_invoices')
    .delete()
    .eq('id', invoiceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/invoices');
  return { ok: true };
}
