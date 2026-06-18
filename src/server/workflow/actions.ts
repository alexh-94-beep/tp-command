'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole, getCurrentUser } from '@/lib/auth/session';
import {
  instantiateBookingTasks,
  recomputeBookingTaskDueDates,
} from '@/services/workflow/instantiate';
import type { BookingTaskStatus } from '@/types/aliases';

type Result = { ok: boolean; error?: string };

async function revalidateForTask(bookingId: string) {
  revalidatePath('/dashboard');
  revalidatePath('/tasks');
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/bookings');
}

// ── Status aendern ────────────────────────────────────────────────────

export async function completeTask(taskId: string): Promise<Result> {
  await requireRole(['admin', 'office']);
  const me = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const { data: t, error: getErr } = await supabase
    .from('booking_tasks')
    .select('id, booking_id')
    .eq('id', taskId)
    .single();
  if (getErr || !t) return { ok: false, error: 'Aufgabe nicht gefunden' };

  const { error } = await supabase
    .from('booking_tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      completed_by: me?.id ?? null,
    })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  void (async () => {
    const { logAudit } = await import('@/services/audit/log');
    await logAudit(supabase, {
      actorId: me?.id ?? null,
      entity: 'booking_task',
      entityId: taskId,
      action: 'status_changed',
      diff: { status: { after: 'done' } },
    });
  })();
  await revalidateForTask(t.booking_id);
  return { ok: true };
}

export async function reopenTask(taskId: string): Promise<Result> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from('booking_tasks')
    .select('id, booking_id')
    .eq('id', taskId)
    .single();
  if (!t) return { ok: false, error: 'Aufgabe nicht gefunden' };

  const { error } = await supabase
    .from('booking_tasks')
    .update({ status: 'open', completed_at: null, completed_by: null })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  await revalidateForTask(t.booking_id);
  return { ok: true };
}

export async function startTask(taskId: string): Promise<Result> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from('booking_tasks')
    .select('id, booking_id')
    .eq('id', taskId)
    .single();
  if (!t) return { ok: false, error: 'Aufgabe nicht gefunden' };
  const { error } = await supabase
    .from('booking_tasks')
    .update({ status: 'in_progress' })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  await revalidateForTask(t.booking_id);
  return { ok: true };
}

const setStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'skipped', 'na']),
});

export async function setTaskStatus(
  taskId: string,
  status: BookingTaskStatus,
): Promise<Result> {
  await requireRole(['admin', 'office', 'cleaning']);
  const me = await getCurrentUser();
  const parsed = setStatusSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: 'Ungültiger Status' };
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from('booking_tasks')
    .select('id, code, booking_id, status')
    .eq('id', taskId)
    .single();
  if (!t) return { ok: false, error: 'Aufgabe nicht gefunden' };

  const update: { status: BookingTaskStatus; completed_at: string | null; completed_by: string | null } = {
    status: parsed.data.status,
    completed_at: parsed.data.status === 'done' ? new Date().toISOString() : null,
    completed_by: parsed.data.status === 'done' ? (me?.id ?? null) : null,
  };
  const { error } = await supabase.from('booking_tasks').update(update).eq('id', taskId);
  if (error) return { ok: false, error: error.message };

  // Phase 25b: Wenn die Langzeit-Auszug-Abnahmereinigung abgehakt wird,
  // legen wir automatisch einen cleaning_task vom Typ 'deep_clean' fuer
  // den Tag nach dem Auszug an — sichtbar in Miremes Tagesplan als
  // "Wohnungsabnahmereinigung".
  if (
    parsed.data.status === 'done' &&
    t.status !== 'done' &&
    t.code === 'schedule_handover_deep_cleaning'
  ) {
    void (async () => {
      try {
        const { autoCreateHandoverDeepClean } = await import(
          '@/services/cleaning/auto-handover'
        );
        await autoCreateHandoverDeepClean(supabase, t.booking_id, me?.id ?? null);
      } catch (e) {
        console.error('[autoCreateHandoverDeepClean] failed:', e);
      }
    })();
  }

  await revalidateForTask(t.booking_id);
  return { ok: true };
}

// ── Zuweisung & Notizen ──────────────────────────────────────────────

export async function assignTask(taskId: string, userId: string | null): Promise<Result> {
  const actor = await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from('booking_tasks')
    .select('id, booking_id')
    .eq('id', taskId)
    .single();
  if (!t) return { ok: false, error: 'Aufgabe nicht gefunden' };

  const { error } = await supabase
    .from('booking_tasks')
    .update({ assigned_to: userId })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  void (async () => {
    const { logAudit } = await import('@/services/audit/log');
    await logAudit(supabase, {
      actorId: actor.id,
      entity: 'booking_task',
      entityId: taskId,
      action: 'assigned',
      diff: { assigned_to: userId },
    });
  })();
  await revalidateForTask(t.booking_id);
  return { ok: true };
}

export async function updateTaskNotes(taskId: string, notes: string): Promise<Result> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from('booking_tasks')
    .select('id, booking_id')
    .eq('id', taskId)
    .single();
  if (!t) return { ok: false, error: 'Aufgabe nicht gefunden' };
  const { error } = await supabase
    .from('booking_tasks')
    .update({ notes: notes || null })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  await revalidateForTask(t.booking_id);
  return { ok: true };
}

export async function updateTaskDueDate(
  taskId: string,
  dueDate: string | null,
): Promise<Result> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from('booking_tasks')
    .select('id, booking_id')
    .eq('id', taskId)
    .single();
  if (!t) return { ok: false, error: 'Aufgabe nicht gefunden' };
  const { error } = await supabase
    .from('booking_tasks')
    .update({ due_date: dueDate })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  await revalidateForTask(t.booking_id);
  return { ok: true };
}

// ── Manuelle Aufgabe ─────────────────────────────────────────────────

const manualTaskSchema = z.object({
  booking_id: z.string().uuid(),
  kind: z.enum(['move_in', 'move_out']),
  title: z.string().min(1, 'Titel fehlt'),
  description: z.string().optional(),
  category: z.string().optional(),
  due_date: z.string().optional(),
});

export async function addManualTask(formData: FormData): Promise<Result> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of ['description', 'category', 'due_date']) {
    if (raw[k] === '') delete raw[k];
  }
  const parsed = manualTaskSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungültige Eingabe' };

  const { data: last } = await supabase
    .from('booking_tasks')
    .select('position')
    .eq('booking_id', parsed.data.booking_id)
    .eq('kind', parsed.data.kind)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (last?.position ?? 0) + 1;

  const { error } = await supabase.from('booking_tasks').insert({
    booking_id: parsed.data.booking_id,
    kind: parsed.data.kind,
    position: nextPos,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    category: parsed.data.category ?? null,
    due_date: parsed.data.due_date ?? null,
    status: 'open',
  });
  if (error) return { ok: false, error: error.message };

  await revalidateForTask(parsed.data.booking_id);
  return { ok: true };
}

export async function deleteManualTask(taskId: string): Promise<Result> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from('booking_tasks')
    .select('id, booking_id, template_task_id')
    .eq('id', taskId)
    .single();
  if (!t) return { ok: false, error: 'Aufgabe nicht gefunden' };
  if (t.template_task_id) {
    return {
      ok: false,
      error:
        'Nur manuelle Aufgaben können gelöscht werden. Setze stattdessen den Status auf „N/A".',
    };
  }
  const { error } = await supabase.from('booking_tasks').delete().eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  await revalidateForTask(t.booking_id);
  return { ok: true };
}

// ── Aus Template neu erzeugen ────────────────────────────────────────

export async function regenerateBookingTasks(
  bookingId: string,
): Promise<Result & { created?: number }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const r = await instantiateBookingTasks(supabase, bookingId);
  if (r.error) return { ok: false, error: r.error };
  await recomputeBookingTaskDueDates(supabase, bookingId);
  await revalidateForTask(bookingId);
  return { ok: true, created: r.created };
}

// ── Zuteilung aendern (Phase 14a) ─────────────────────────────────────

export async function assignBookingTask(
  taskId: string,
  userId: string | null,
): Promise<Result> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase
    .from('booking_tasks')
    .select('booking_id')
    .eq('id', taskId)
    .maybeSingle();
  const { error } = await supabase
    .from('booking_tasks')
    .update({ assigned_to: userId })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  if (t?.booking_id) await revalidateForTask(t.booking_id);
  return { ok: true };
}

// (Type re-export entfernt — in 'use server'-Files werden Type-Re-Exports
// inkonsistent vom Next-Bundler behandelt und koennen Runtime-Fehler
// 'WorkflowKind is not defined' verursachen, wenn die Action-Module-Kette
// von einer fremden Server-Action getriggert wird. Pages importieren den
// Type direkt aus @/types/aliases.)
