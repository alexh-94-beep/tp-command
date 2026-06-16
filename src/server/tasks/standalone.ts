'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole, getCurrentUser } from '@/lib/auth/session';
import type { StandaloneTaskStatus } from '@/types/aliases';

// ── create ─────────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(1, 'Titel fehlt'),
  description: z.string().optional(),
  category: z
    .enum(['repair', 'office', 'inspection', 'damage_report', 'lift_reservation', 'other'])
    .default('other'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  apartment_id: z.string().uuid().optional(),
  assignee_id: z.string().uuid().optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
});

export async function createStandaloneTask(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  // Phase 15: Mireme (cleaning) darf Aufgaben aus Telefon-Annahme erfassen
  await requireRole(['admin', 'office', 'cleaning']);
  const user = await getCurrentUser();
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Bitte Eingaben pruefen.' };
  const v = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: created, error } = await supabase
    .from('standalone_tasks')
    .insert({
      title: v.title,
      description: v.description ?? null,
      category: v.category,
      priority: v.priority,
      apartment_id: v.apartment_id ?? null,
      assignee_id: v.assignee_id ?? null,
      due_date: v.due_date ?? null,
      notes: v.notes ?? null,
      created_by: user?.id ?? null,
      status: 'open',
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/tasks');
  revalidatePath('/dashboard');
  if (v.apartment_id) revalidatePath(`/apartments/${v.apartment_id}`);
  return { ok: true, taskId: created.id };
}

// ── update (Titel, Beschreibung, Felder) ───────────────────────────────

const updateSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z
    .enum(['repair', 'office', 'inspection', 'damage_report', 'lift_reservation', 'other'])
    .optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  apartment_id: z.string().uuid().optional(),
  assignee_id: z.string().uuid().optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
});

export async function updateStandaloneTask(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const { task_id, ...patch } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('standalone_tasks')
    .update(patch)
    .eq('id', task_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/tasks');
  if (patch.apartment_id) revalidatePath(`/apartments/${patch.apartment_id}`);
  return { ok: true };
}

// ── setStatus ──────────────────────────────────────────────────────────

export async function setStandaloneTaskStatus(
  taskId: string,
  status: StandaloneTaskStatus,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'cleaning']);
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();

  const patch: {
    status: StandaloneTaskStatus;
    done_at: string | null;
    done_by: string | null;
  } = { status, done_at: null, done_by: null };
  if (status === 'done') {
    patch.done_at = new Date().toISOString();
    patch.done_by = user?.id ?? null;
  }

  const { error } = await supabase
    .from('standalone_tasks')
    .update(patch)
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/tasks');
  revalidatePath('/dashboard');
  return { ok: true };
}

// ── delete ─────────────────────────────────────────────────────────────

export async function deleteStandaloneTask(
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('standalone_tasks')
    .delete()
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
  return { ok: true };
}
