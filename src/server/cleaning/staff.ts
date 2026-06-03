'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';

const staffSchema = z.object({
  full_name: z.string().min(1, 'Name fehlt'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export async function createStaff(formData: FormData) {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of ['email', 'phone', 'notes']) {
    if (raw[k] === '') delete raw[k];
  }
  const parsed = staffSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungültige Eingabe' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('cleaning_staff').insert({
    full_name: parsed.data.full_name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    notes: parsed.data.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/staff');
  return { ok: true };
}

export async function updateStaff(staffId: string, formData: FormData) {
  await requireRole(['admin', 'office']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of ['email', 'phone', 'notes']) {
    if (raw[k] === '') delete raw[k];
  }
  const parsed = staffSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungültige Eingabe' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('cleaning_staff')
    .update({
      full_name: parsed.data.full_name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      notes: parsed.data.notes ?? null,
    })
    .eq('id', staffId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/staff');
  return { ok: true };
}

export async function setStaffActive(staffId: string, active: boolean) {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('cleaning_staff')
    .update({ is_active: active })
    .eq('id', staffId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/staff');
  return { ok: true };
}

export async function assignTaskToStaff(taskId: string, staffId: string | null) {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('cleaning_tasks')
    .update({ staff_id: staffId })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/cleaning');
  revalidatePath('/cleaning/daily');
  revalidatePath(`/cleaning/${taskId}`);
  return { ok: true };
}

/** Drag&Drop im Wochenplan: Person UND/ODER Datum in einem Schritt. */
export async function moveCleaningTask(input: {
  taskId: string;
  staffId: string | null;
  scheduledDate: string;
}) {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('cleaning_tasks')
    .update({
      staff_id: input.staffId,
      scheduled_date: input.scheduledDate,
    })
    .eq('id', input.taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/cleaning');
  revalidatePath('/cleaning/daily');
  revalidatePath(`/cleaning/${input.taskId}`);
  return { ok: true };
}
