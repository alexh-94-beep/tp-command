'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole, getCurrentUser } from '@/lib/auth/session';
import type { ApartmentDamageStatus } from '@/types/aliases';

// ── createDamage ──────────────────────────────────────────────────────

const createSchema = z.object({
  apartment_id: z.string().uuid().optional(),
  external_apartment_id: z.string().uuid().optional(),
  cleaning_task_id: z.string().uuid().optional(),
  description: z.string().min(1, 'Beschreibung fehlt'),
  severity: z.enum(['minor', 'normal', 'major', 'urgent']).default('normal'),
  photo_url: z.string().optional(),
  notes: z.string().optional(),
});

export async function createApartmentDamage(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; damageId?: string }> {
  await requireRole(['admin', 'office', 'cleaning']);
  const user = await getCurrentUser();
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Bitte Beschreibung eingeben.' };
  const v = parsed.data;
  if (!v.apartment_id && !v.external_apartment_id) {
    return { ok: false, error: 'Wohnung fehlt (eigene oder extern).' };
  }
  const supabase = await createSupabaseServerClient();
  const { data: created, error } = await supabase
    .from('apartment_damages')
    .insert({
      apartment_id: v.apartment_id ?? null,
      external_apartment_id: v.external_apartment_id ?? null,
      cleaning_task_id: v.cleaning_task_id ?? null,
      description: v.description,
      severity: v.severity,
      status: 'open',
      photo_url: v.photo_url ?? null,
      notes: v.notes ?? null,
      reported_by: user?.id ?? null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  void (async () => {
    const { logAudit } = await import('@/services/audit/log');
    await logAudit(supabase, {
      actorId: user?.id ?? null,
      entity: 'apartment_damage',
      entityId: created.id,
      action: 'created',
      diff: {
        apartment_id: v.apartment_id ?? null,
        external_apartment_id: v.external_apartment_id ?? null,
        severity: v.severity,
        description: v.description,
      },
    });
  })();
  if (v.apartment_id) revalidatePath(`/apartments/${v.apartment_id}`);
  revalidatePath('/cleaning');
  return { ok: true, damageId: created.id };
}

// ── updateDamage ──────────────────────────────────────────────────────

const updateSchema = z.object({
  damage_id: z.string().uuid(),
  description: z.string().min(1).optional(),
  severity: z.enum(['minor', 'normal', 'major', 'urgent']).optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'wont_fix']).optional(),
  photo_url: z.string().optional(),
  notes: z.string().optional(),
  resolution_notes: z.string().optional(),
});

export async function updateApartmentDamage(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const user = await getCurrentUser();
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const { damage_id, ...patch } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: dam } = await supabase
    .from('apartment_damages')
    .select('apartment_id')
    .eq('id', damage_id)
    .maybeSingle();
  const { error } = await supabase
    .from('apartment_damages')
    .update(patch)
    .eq('id', damage_id);
  if (error) return { ok: false, error: error.message };
  void (async () => {
    const { logAudit } = await import('@/services/audit/log');
    await logAudit(supabase, {
      actorId: user?.id ?? null,
      entity: 'apartment_damage',
      entityId: damage_id,
      action: 'updated',
      diff: patch as Record<string, unknown>,
    });
  })();
  if (dam?.apartment_id) revalidatePath(`/apartments/${dam.apartment_id}`);
  return { ok: true };
}

// ── setStatus / resolve ───────────────────────────────────────────────

export async function setDamageStatus(
  damageId: string,
  status: ApartmentDamageStatus,
  resolutionNotes?: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const patch: {
    status: ApartmentDamageStatus;
    resolved_at: string | null;
    resolved_by: string | null;
    resolution_notes?: string;
  } = {
    status,
    resolved_at: null,
    resolved_by: null,
  };
  if (status === 'resolved' || status === 'wont_fix') {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = user?.id ?? null;
    if (resolutionNotes) patch.resolution_notes = resolutionNotes;
  }
  const { data: dam } = await supabase
    .from('apartment_damages')
    .select('apartment_id')
    .eq('id', damageId)
    .maybeSingle();
  const { error } = await supabase
    .from('apartment_damages')
    .update(patch)
    .eq('id', damageId);
  if (error) return { ok: false, error: error.message };
  void (async () => {
    const { logAudit } = await import('@/services/audit/log');
    await logAudit(supabase, {
      actorId: user?.id ?? null,
      entity: 'apartment_damage',
      entityId: damageId,
      action: 'status_changed',
      diff: { status: { after: status } },
      note: resolutionNotes,
    });
  })();
  if (dam?.apartment_id) revalidatePath(`/apartments/${dam.apartment_id}`);
  return { ok: true };
}

// ── delete ────────────────────────────────────────────────────────────

export async function deleteApartmentDamage(
  damageId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const { data: dam } = await supabase
    .from('apartment_damages')
    .select('apartment_id')
    .eq('id', damageId)
    .maybeSingle();
  const { error } = await supabase
    .from('apartment_damages')
    .delete()
    .eq('id', damageId);
  if (error) return { ok: false, error: error.message };
  void (async () => {
    const { logAudit } = await import('@/services/audit/log');
    await logAudit(supabase, {
      actorId: user?.id ?? null,
      entity: 'apartment_damage',
      entityId: damageId,
      action: 'deleted',
    });
  })();
  if (dam?.apartment_id) revalidatePath(`/apartments/${dam.apartment_id}`);
  return { ok: true };
}
