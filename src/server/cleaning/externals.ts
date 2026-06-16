'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';

// ── Eigentümer anlegen ────────────────────────────────────────────────

const ownerSchema = z.object({
  name: z.string().min(1, 'Name fehlt'),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export interface CreateOwnerResult {
  ok: boolean;
  error?: string;
  ownerId?: string;
}

export async function createExternalOwner(
  formData: FormData,
): Promise<CreateOwnerResult> {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = ownerSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Bitte mind. den Namen ausfüllen.' };
  }
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: created, error } = await supabase
    .from('external_owners')
    .insert({
      name: v.name,
      contact_phone: v.contact_phone ?? null,
      contact_email: v.contact_email ?? null,
      address: v.address ?? null,
      notes: v.notes ?? null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/cleaning');
  revalidatePath('/settings');
  return { ok: true, ownerId: created.id };
}

// ── Wohnung eines Eigentümers anlegen ─────────────────────────────────

const externalAptSchema = z.object({
  owner_id: z.string().uuid(),
  label: z.string().min(1, 'Wohnungsbezeichnung fehlt (z.B. E.2203)'),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export interface CreateExternalAptResult {
  ok: boolean;
  error?: string;
  externalApartmentId?: string;
}

export async function createExternalApartment(
  formData: FormData,
): Promise<CreateExternalAptResult> {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = externalAptSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Bitte Eingaben prüfen.' };
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();

  // Kontaktdaten der Wohnung von Owner spiegeln (Default-Werte) — der
  // PDF-Renderer nutzt die external_apartments-Felder direkt.
  const { data: owner } = await supabase
    .from('external_owners')
    .select('name, contact_phone, contact_email, address')
    .eq('id', v.owner_id)
    .single();

  const { data: created, error } = await supabase
    .from('external_apartments')
    .insert({
      label: v.label,
      address: v.address ?? owner?.address ?? null,
      contact_name: owner?.name ?? null,
      contact_phone: owner?.contact_phone ?? null,
      contact_email: owner?.contact_email ?? null,
      notes: v.notes ?? null,
      owner_id: v.owner_id,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/cleaning');
  revalidatePath('/settings');
  return { ok: true, externalApartmentId: created.id };
}

// ── Komfort: Owner + erste Wohnung in einem Schritt ───────────────────

const combinedSchema = z.object({
  owner_name: z.string().min(1, 'Eigentümer-Name fehlt'),
  owner_phone: z.string().optional(),
  owner_email: z.string().email().optional().or(z.literal('')),
  owner_address: z.string().optional(),
  owner_notes: z.string().optional(),
  apartment_label: z.string().min(1, 'Wohnungs-Nr. fehlt (z.B. E.2203)'),
  apartment_address: z.string().optional(),
});

export interface CreateOwnerWithApartmentResult {
  ok: boolean;
  error?: string;
  ownerId?: string;
  externalApartmentId?: string;
}

export async function createOwnerWithApartment(
  formData: FormData,
): Promise<CreateOwnerWithApartmentResult> {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = combinedSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Name und Wohnungs-Nr. sind Pflicht.' };
  }
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: owner, error: ownerErr } = await supabase
    .from('external_owners')
    .insert({
      name: v.owner_name,
      contact_phone: v.owner_phone ?? null,
      contact_email: v.owner_email ?? null,
      address: v.owner_address ?? null,
      notes: v.owner_notes ?? null,
    })
    .select('id')
    .single();
  if (ownerErr || !owner) return { ok: false, error: ownerErr?.message ?? 'Fehler' };

  const { data: apt, error: aptErr } = await supabase
    .from('external_apartments')
    .insert({
      label: v.apartment_label,
      address: v.apartment_address ?? v.owner_address ?? null,
      contact_name: v.owner_name,
      contact_phone: v.owner_phone ?? null,
      contact_email: v.owner_email ?? null,
      owner_id: owner.id,
    })
    .select('id')
    .single();
  if (aptErr || !apt) {
    return { ok: false, error: aptErr?.message ?? 'Wohnung konnte nicht angelegt werden' };
  }

  revalidatePath('/cleaning');
  revalidatePath('/settings');
  return { ok: true, ownerId: owner.id, externalApartmentId: apt.id };
}

// ── updateExternalOwner (Settings-Page) ───────────────────────────────

const updateOwnerSchema = z.object({
  owner_id: z.string().uuid(),
  name: z.string().min(1, 'Name fehlt').optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export async function updateExternalOwner(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = updateOwnerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const { owner_id, ...patch } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('external_owners')
    .update(patch)
    .eq('id', owner_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/external-owners');
  revalidatePath('/cleaning');
  return { ok: true };
}

// ── setExternalOwnerActive (Toggle) ───────────────────────────────────

export async function setExternalOwnerActive(
  ownerId: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('external_owners')
    .update({ is_active: isActive })
    .eq('id', ownerId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/external-owners');
  revalidatePath('/cleaning');
  return { ok: true };
}

// ── deleteExternalApartment ───────────────────────────────────────────

export async function deleteExternalApartment(
  apartmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('external_apartments')
    .delete()
    .eq('id', apartmentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/external-owners');
  revalidatePath('/cleaning');
  return { ok: true };
}
