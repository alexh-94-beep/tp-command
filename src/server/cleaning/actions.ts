'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import {
  cancelCheckoutCleaningForBooking,
  ensureCheckoutCleaningForBooking,
  generateUpcomingCleanings,
} from '@/services/cleaning/generate';
import { estimateDurationMinutes, type CleaningSource } from '@/services/cleaning/duration';
import type { CleaningStatus } from '@/types/aliases';

// ── Wohnungsabnahme (handover) ────────────────────────────────────────

export interface MarkHandoverInput {
  bookingId: string;
  pdfBase64?: string;
  pdfFilename?: string;
}

export async function markHandoverDone(input: MarkHandoverInput) {
  const user = await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, apartment_id, tenant_id')
    .eq('id', input.bookingId)
    .single();
  if (error || !booking) return { ok: false, error: error?.message ?? 'Buchung nicht gefunden' };

  const { error: updErr } = await supabase
    .from('bookings')
    .update({
      handover_completed_at: new Date().toISOString(),
      handover_by: user.id,
    })
    .eq('id', input.bookingId);
  if (updErr) return { ok: false, error: updErr.message };

  if (input.pdfBase64 && input.pdfFilename) {
    try {
      const buf = Buffer.from(input.pdfBase64, 'base64');
      const path = `handover/${booking.id}/${input.pdfFilename}`;
      const { error: upErr } = await supabase.storage
        .from('tenant-documents')
        .upload(path, buf, { contentType: 'application/pdf', upsert: true });
      if (!upErr) {
        await supabase.from('tenant_documents').insert({
          tenant_id: booking.tenant_id,
          booking_id: booking.id,
          type: 'other',
          filename: input.pdfFilename,
          storage_path: path,
          mime_type: 'application/pdf',
          size_bytes: buf.byteLength,
        });
      }
    } catch {
      // PDF-Upload-Fehler nicht fatal
    }
  }

  await ensureCheckoutCleaningForBooking(supabase, input.bookingId);

  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/cleaning');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function undoHandover(bookingId: string) {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('bookings')
    .update({ handover_completed_at: null, handover_by: null })
    .eq('id', bookingId);
  if (error) return { ok: false, error: error.message };

  const { data: b } = await supabase
    .from('bookings')
    .select('handover_planned_at')
    .eq('id', bookingId)
    .single();
  if (!b?.handover_planned_at) await cancelCheckoutCleaningForBooking(supabase, bookingId);

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/cleaning');
  return { ok: true };
}

// ── Abnahme planen ───────────────────────────────────────────────────

export async function planHandover(input: { bookingId: string; plannedAtIso: string }) {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('bookings')
    .update({ handover_planned_at: input.plannedAtIso })
    .eq('id', input.bookingId);
  if (error) return { ok: false, error: `Plan speichern: ${error.message}` };

  const r = await ensureCheckoutCleaningForBooking(supabase, input.bookingId);
  if (!r.ok) {
    return {
      ok: false,
      error: `Plan gespeichert, aber Reinigungs-Auftrag konnte nicht erstellt werden: ${r.error}`,
    };
  }
  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/cleaning');
  return { ok: true, cleaning_task_id: r.cleaning_task_id, action: r.action };
}

export async function clearHandoverPlan(bookingId: string) {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('bookings')
    .update({ handover_planned_at: null })
    .eq('id', bookingId);
  if (error) return { ok: false, error: error.message };

  const { data: b } = await supabase
    .from('bookings')
    .select('handover_completed_at')
    .eq('id', bookingId)
    .single();
  if (!b?.handover_completed_at) await cancelCheckoutCleaningForBooking(supabase, bookingId);

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/cleaning');
  return { ok: true };
}

// ── Reinigungs-Auftrag bearbeiten ────────────────────────────────────

export async function assignCleaningTask(taskId: string, userId: string | null) {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('cleaning_tasks')
    .update({ assigned_to: userId })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/cleaning');
  revalidatePath(`/cleaning/${taskId}`);
  return { ok: true };
}

const statusSchema = z.enum(['open', 'in_progress', 'done', 'quality_checked']);

export async function updateCleaningStatus(taskId: string, status: string) {
  const user = await requireRole(['admin', 'office', 'cleaning']);
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: 'Ungültiger Status' };

  const supabase = await createSupabaseServerClient();
  const patch: {
    status: CleaningStatus;
    completed_at?: string;
    quality_checked_at?: string;
    quality_checked_by?: string;
  } = { status: parsed.data };
  if (parsed.data === 'done') patch.completed_at = new Date().toISOString();
  if (parsed.data === 'quality_checked') {
    patch.quality_checked_at = new Date().toISOString();
    patch.quality_checked_by = user.id;
  }

  const { error } = await supabase.from('cleaning_tasks').update(patch).eq('id', taskId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/cleaning');
  revalidatePath(`/cleaning/${taskId}`);
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function saveInspection(input: {
  taskId: string;
  damageFound: boolean;
  damageDescription: string;
  inspectionSummary: string;
}) {
  await requireRole(['admin', 'office', 'cleaning']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('cleaning_tasks')
    .update({
      damage_found: input.damageFound,
      damage_description: input.damageDescription || null,
      inspection_summary: input.inspectionSummary || null,
    })
    .eq('id', input.taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/cleaning/${input.taskId}`);
  return { ok: true };
}

export async function saveActualDuration(taskId: string, minutes: number | null) {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('cleaning_tasks')
    .update({ actual_duration_minutes: minutes })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/cleaning/${taskId}`);
  revalidatePath('/cleaning/daily');
  return { ok: true };
}

export async function appendCleaningNote(taskId: string, note: string) {
  await requireRole(['admin', 'office', 'cleaning']);
  const supabase = await createSupabaseServerClient();
  const { data: task } = await supabase
    .from('cleaning_tasks')
    .select('notes')
    .eq('id', taskId)
    .single();
  const newNotes = `${task?.notes ? task.notes + '\n' : ''}${new Date().toLocaleString('de-CH')}: ${note}`;
  const { error } = await supabase
    .from('cleaning_tasks')
    .update({ notes: newNotes })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/cleaning/${taskId}`);
  return { ok: true };
}

export async function uploadCleaningPhoto(input: {
  taskId: string;
  filename: string;
  base64: string;
  mimeType: string;
}) {
  const user = await requireRole(['admin', 'office', 'cleaning']);
  const supabase = await createSupabaseServerClient();
  const buf = Buffer.from(input.base64, 'base64');
  const path = `${input.taskId}/${Date.now()}-${input.filename}`;
  const { error: upErr } = await supabase.storage
    .from('cleaning-photos')
    .upload(path, buf, { contentType: input.mimeType, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: insErr } = await supabase.from('cleaning_photos').insert({
    cleaning_task_id: input.taskId,
    storage_path: path,
    uploaded_by: user.id,
  });
  if (insErr) return { ok: false, error: insErr.message };
  revalidatePath(`/cleaning/${input.taskId}`);
  return { ok: true };
}

// ── Generator-Trigger + Dauer-Neuberechnung ───────────────────────────

export async function triggerGenerateCleanings() {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const r = await generateUpcomingCleanings(supabase);
  revalidatePath('/cleaning');
  return { ok: true, ...r };
}

export async function recalculateAllDurations() {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();

  const { data: tasks } = await supabase
    .from('cleaning_tasks')
    .select(
      'id, type, estimated_duration_minutes, subleasing_stay_id, booking_id, apartment:apartments(type), booking:bookings(rental_type), stay:subleasing_stays(source)',
    );

  let updated = 0;
  let unchanged = 0;
  for (const t of tasks ?? []) {
    const aptType = t.apartment?.type ?? 'senior';
    let source: CleaningSource = 'own';
    if (t.stay?.source === 'cityus') source = 'cityus';
    else if (t.booking?.rental_type === 'booking') source = 'booking';

    const correct = estimateDurationMinutes(source, aptType, t.type);
    if (t.estimated_duration_minutes === correct) {
      unchanged++;
      continue;
    }
    await supabase
      .from('cleaning_tasks')
      .update({ estimated_duration_minutes: correct })
      .eq('id', t.id);
    updated++;
  }

  revalidatePath('/cleaning');
  revalidatePath('/cleaning/daily');
  return { ok: true, updated, unchanged, total: (tasks ?? []).length };
}

// ── Manuelle Anlage eines Reinigungs-Auftrags (Phase 10) ──────────────
//
// Office bekommt einen Anruf "Bitte zusaetzliche Reinigung in C.0202
// am Freitag" und kann den Auftrag direkt erfassen — ohne Umweg ueber
// eine Buchung.

const createCleaningSchema = z.object({
  apartment_id: z.string().uuid().optional(),
  external_apartment_id: z.string().uuid().optional(),
  scheduled_date: z.string().min(1, 'Datum fehlt'),
  scheduled_time: z.string().optional(),
  type: z.enum([
    'checkout',
    'pre_checkin',
    'intermediate',
    'special',
    'deep_clean',
    'inspection',
    'weekly_clean',
    'weekly_clean_linen',
  ]),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  staff_id: z.string().uuid().optional(),
  estimated_duration_minutes: z.coerce.number().int().positive().optional(),
  notes: z.string().optional(),
  linen_change: z
    .preprocess((v) => v === '1' || v === 'on' || v === true, z.boolean())
    .default(false),
  time_flexible: z
    .preprocess((v) => v === '1' || v === 'on' || v === true, z.boolean())
    .default(true),
  time_constraint_note: z.string().optional(),
});

export async function createCleaningTask(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  // Mireme (cleaning) darf Reinigungsauftraege selbst erfassen (Phase 15)
  await requireRole(['admin', 'office', 'cleaning']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = createCleaningSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Bitte Eingaben pruefen.' };
  const v = parsed.data;
  if (!v.apartment_id && !v.external_apartment_id) {
    return { ok: false, error: 'Bitte eine Wohnung wählen (eigene oder extern).' };
  }
  const supabase = await createSupabaseServerClient();

  // Default-Dauer aus Wohnungstyp ableiten, wenn keine angegeben wurde
  let duration = v.estimated_duration_minutes;
  if (!duration && v.apartment_id) {
    const { data: apt } = await supabase
      .from('apartments')
      .select('type')
      .eq('id', v.apartment_id)
      .maybeSingle();
    if (apt) {
      const src: CleaningSource = v.type.startsWith('weekly_') ? 'cityus' : 'booking';
      duration = estimateDurationMinutes(src, apt.type, v.type);
    }
  }

  // weekly_clean_linen impliziert Bettwaesche-Wechsel
  const linenChange = v.linen_change || v.type === 'weekly_clean_linen';

  const { data: created, error } = await supabase
    .from('cleaning_tasks')
    .insert({
      apartment_id: v.apartment_id ?? null,
      external_apartment_id: v.external_apartment_id ?? null,
      scheduled_date: v.scheduled_date,
      scheduled_time: v.scheduled_time ?? null,
      type: v.type,
      priority: v.priority,
      status: 'open',
      staff_id: v.staff_id ?? null,
      estimated_duration_minutes: duration ?? null,
      notes: v.notes ?? null,
      linen_change: linenChange,
      time_flexible: v.time_flexible,
      time_constraint_note: v.time_constraint_note ?? null,
      source: v.external_apartment_id ? 'external_owner' : 'manual',
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/cleaning');
  revalidatePath('/cleaning/daily');
  revalidatePath('/cleaning/weekly');
  revalidatePath('/dashboard');
  revalidatePath(`/apartments/${v.apartment_id}`);
  return { ok: true, taskId: created.id };
}

// ── Edit: Stammdaten eines Auftrags aendern ───────────────────────────
// Mireme (cleaning) darf eigene oder unassignierte Tasks bearbeiten
// (RLS regelt das per "cleaning_tasks update cleaning"-Policy).

const updateCleaningSchema = z.object({
  task_id: z.string().uuid(),
  scheduled_date: z.string().min(1).optional(),
  scheduled_time: z.string().optional().nullable(),
  type: z
    .enum([
      'checkout',
      'pre_checkin',
      'intermediate',
      'special',
      'deep_clean',
      'inspection',
      'weekly_clean',
      'weekly_clean_linen',
    ])
    .optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  estimated_duration_minutes: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
  linen_change: z
    .preprocess((v) => v === '1' || v === 'on' || v === true, z.boolean())
    .optional(),
  time_flexible: z
    .preprocess((v) => v === '1' || v === 'on' || v === true, z.boolean())
    .optional(),
  time_constraint_note: z.string().optional().nullable(),
});

export async function updateCleaningTask(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'cleaning']);
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  // Leere Strings -> Null (damit DB-NULL gesetzt wird statt empty-string)
  for (const k of Object.keys(raw)) if (raw[k] === '') raw[k] = null;
  const parsed = updateCleaningSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Bitte Eingaben pruefen.' };
  const { task_id, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) return { ok: true };

  const supabase = await createSupabaseServerClient();
  // Stornierte Tasks duerfen nicht mehr editiert werden — UI blendet das aus,
  // wir checken hier nochmal serverseitig.
  const { data: current } = await supabase
    .from('cleaning_tasks')
    .select('status')
    .eq('id', task_id)
    .maybeSingle();
  if (!current) return { ok: false, error: 'Auftrag nicht gefunden' };
  if (current.status === 'cancelled') {
    return { ok: false, error: 'Stornierte Aufträge können nicht bearbeitet werden.' };
  }

  const { error } = await supabase.from('cleaning_tasks').update(patch).eq('id', task_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/cleaning');
  revalidatePath(`/cleaning/${task_id}`);
  revalidatePath('/cleaning/daily');
  revalidatePath('/cleaning/weekly');
  revalidatePath('/dashboard');
  return { ok: true };
}

// ── Stornieren mit Begruendung ────────────────────────────────────────

export async function cancelCleaningTask(
  taskId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(['admin', 'office', 'cleaning']);
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    return { ok: false, error: 'Bitte einen kurzen Grund (mind. 3 Zeichen) angeben.' };
  }
  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase
    .from('cleaning_tasks')
    .select('status')
    .eq('id', taskId)
    .maybeSingle();
  if (!current) return { ok: false, error: 'Auftrag nicht gefunden' };
  if (current.status === 'done' || current.status === 'quality_checked') {
    return { ok: false, error: 'Erledigte Aufträge können nicht storniert werden.' };
  }
  if (current.status === 'cancelled') return { ok: true };

  const { error } = await supabase
    .from('cleaning_tasks')
    .update({
      status: 'cancelled',
      cancellation_reason: trimmed,
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
    })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/cleaning');
  revalidatePath(`/cleaning/${taskId}`);
  revalidatePath('/cleaning/daily');
  revalidatePath('/cleaning/weekly');
  revalidatePath('/dashboard');
  return { ok: true };
}

// ── Storno zuruecknehmen (Office only) ────────────────────────────────

export async function uncancelCleaningTask(
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('cleaning_tasks')
    .update({
      status: 'open',
      cancellation_reason: null,
      cancelled_at: null,
      cancelled_by: null,
    })
    .eq('id', taskId)
    .eq('status', 'cancelled');
  if (error) return { ok: false, error: error.message };

  revalidatePath('/cleaning');
  revalidatePath(`/cleaning/${taskId}`);
  return { ok: true };
}
