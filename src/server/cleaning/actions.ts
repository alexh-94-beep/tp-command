'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole, getCurrentUser } from '@/lib/auth/session';
import {
  cancelCheckoutCleaningForBooking,
  ensureCheckoutCleaningForBooking,
  generateUpcomingCleanings,
} from '@/services/cleaning/generate';

/* -------------------------------------------------- *
 *  Wohnungsabnahme bestätigen + optionales Protokoll  *
 * -------------------------------------------------- */
export interface MarkHandoverInput {
  bookingId: string;
  pdfBase64?: string;
  pdfFilename?: string;
}

export async function markHandoverDone(input: MarkHandoverInput) {
  const user = await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();

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

  // Optional: PDF speichern
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
      /* upload-Fehler nicht fatal */
    }
  }

  // Direkt Reinigungs-Auftrag erzeugen
  await ensureCheckoutCleaningForBooking(input.bookingId);

  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/cleaning');
  revalidatePath('/dashboard');

  return { ok: true };
}

export async function undoHandover(bookingId: string) {
  await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('bookings')
    .update({ handover_completed_at: null, handover_by: null })
    .eq('id', bookingId);
  if (error) return { ok: false, error: error.message };
  // Wenn auch keine Planung mehr offen, Reinigungs-Auftrag entfernen
  const { data: b } = await supabase
    .from('bookings')
    .select('handover_planned_at')
    .eq('id', bookingId)
    .single();
  if (!b?.handover_planned_at) await cancelCheckoutCleaningForBooking(bookingId);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/cleaning');
  return { ok: true };
}

/* -------------------------------------------------- *
 *  Abnahme planen                                     *
 * -------------------------------------------------- */
export async function planHandover(input: { bookingId: string; plannedAtIso: string }) {
  await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from('bookings')
    .update({ handover_planned_at: input.plannedAtIso })
    .eq('id', input.bookingId);
  if (error) return { ok: false, error: `Plan speichern: ${error.message}` };

  const r = await ensureCheckoutCleaningForBooking(input.bookingId);
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
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('bookings')
    .update({ handover_planned_at: null })
    .eq('id', bookingId);
  if (error) return { ok: false, error: error.message };
  // Wenn auch keine Erledigung markiert, Reinigungs-Auftrag entfernen
  const { data: b } = await supabase
    .from('bookings')
    .select('handover_completed_at')
    .eq('id', bookingId)
    .single();
  if (!b?.handover_completed_at) await cancelCheckoutCleaningForBooking(bookingId);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath('/cleaning');
  return { ok: true };
}

/* -------------------------------------------------- *
 *  Reinigungs-Auftrag bearbeiten                       *
 * -------------------------------------------------- */
export async function assignCleaningTask(taskId: string, userId: string | null) {
  await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();
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

  const supabase = createSupabaseServerClient();
  const patch: Record<string, unknown> = { status: parsed.data };
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
  const supabase = createSupabaseServerClient();
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
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('cleaning_tasks')
    .update({ actual_duration_minutes: minutes })
    .eq('id', taskId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/cleaning/${taskId}`);
  revalidatePath('/cleaning/daily');
  revalidatePath('/cleaning/weekly');
  return { ok: true };
}

export async function appendCleaningNote(taskId: string, note: string) {
  await requireRole(['admin', 'office', 'cleaning']);
  const supabase = createSupabaseServerClient();
  const { data: task } = await supabase
    .from('cleaning_tasks')
    .select('notes')
    .eq('id', taskId)
    .single();
  const newNotes = `${task?.notes ? task.notes + '\n' : ''}${new Date().toLocaleString('de-CH')}: ${note}`;
  const { error } = await supabase.from('cleaning_tasks').update({ notes: newNotes }).eq('id', taskId);
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
  const supabase = createSupabaseServerClient();
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

/* -------------------------------------------------- *
 *  Manueller Spezial-Auftrag                          *
 * -------------------------------------------------- */
const newTaskSchema = z.object({
  apartment_id: z.string().uuid().optional(),
  external_apartment_id: z.string().uuid().optional(),
  scheduled_date: z.string(),
  scheduled_time: z.string().optional(),
  access_method: z
    .enum(['key_available', 'customer_at_home', 'key_at_reception', 'key_box', 'other'])
    .optional(),
  access_notes: z.string().optional(),
  type: z.enum([
    'checkout',
    'pre_checkin',
    'intermediate',
    'special',
    'deep_clean',
    'inspection',
    'weekly_clean',
  ]),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  staff_id: z.string().uuid().optional(),
  notes: z.string().optional(),
  // Inline-Anlegen externer Wohnung
  new_external_label: z.string().optional(),
  new_external_address: z.string().optional(),
  new_external_contact_name: z.string().optional(),
  new_external_contact_phone: z.string().optional(),
  new_external_contact_email: z.string().optional(),
});

export async function createCleaningTask(formData: FormData) {
  await requireRole(['admin', 'office']);
  const raw = Object.fromEntries(formData.entries());
  for (const k of [
    'apartment_id',
    'external_apartment_id',
    'staff_id',
    'notes',
    'scheduled_time',
    'access_method',
    'access_notes',
    'new_external_label',
    'new_external_address',
    'new_external_contact_name',
    'new_external_contact_phone',
    'new_external_contact_email',
  ]) {
    if (raw[k] === '') delete raw[k];
  }
  const parsed = newTaskSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Ungültige Eingabe' };
  }

  const supabase = createSupabaseServerClient();
  let externalApartmentId = parsed.data.external_apartment_id ?? null;

  // Inline neue externe Wohnung anlegen
  if (!parsed.data.apartment_id && !externalApartmentId && parsed.data.new_external_label) {
    const { data: created, error } = await supabase
      .from('external_apartments')
      .insert({
        label: parsed.data.new_external_label,
        address: parsed.data.new_external_address ?? null,
        contact_name: parsed.data.new_external_contact_name ?? null,
        contact_phone: parsed.data.new_external_contact_phone ?? null,
        contact_email: parsed.data.new_external_contact_email ?? null,
      })
      .select('id')
      .single();
    if (error || !created) return { ok: false, error: `Externe Wohnung: ${error?.message}` };
    externalApartmentId = created.id;
  }

  if (!parsed.data.apartment_id && !externalApartmentId) {
    return { ok: false, error: 'Wohnung wählen (intern oder extern).' };
  }

  const { data, error } = await supabase
    .from('cleaning_tasks')
    .insert({
      apartment_id: parsed.data.apartment_id ?? null,
      external_apartment_id: externalApartmentId,
      scheduled_date: parsed.data.scheduled_date,
      scheduled_time: parsed.data.scheduled_time ?? null,
      access_method: parsed.data.access_method ?? null,
      access_notes: parsed.data.access_notes ?? null,
      type: parsed.data.type,
      priority: parsed.data.priority,
      status: 'open',
      staff_id: parsed.data.staff_id ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/cleaning');
  return { ok: true, taskId: data.id };
}

/* -------------------------------------------------- *
 *  Manueller Generator-Trigger                        *
 * -------------------------------------------------- */
export async function triggerGenerateCleanings() {
  await requireRole(['admin', 'office']);
  const r = await generateUpcomingCleanings();
  revalidatePath('/cleaning');
  return { ok: true, ...r };
}

/* -------------------------------------------------- *
 *  Dauer für alle bestehenden Aufgaben neu berechnen  *
 * -------------------------------------------------- */
export async function recalculateAllDurations() {
  await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();
  const { estimateDurationMinutes } = await import('@/services/cleaning/duration');

  // Alle Tasks laden mit den nötigen Joins
  const { data: tasks } = await supabase
    .from('cleaning_tasks')
    .select(
      `
      id, type, estimated_duration_minutes, subleasing_stay_id, booking_id,
      apartment:apartments(type),
      booking:bookings(rental_type),
      stay:subleasing_stays(source)
    `,
    );

  let updated = 0;
  let unchanged = 0;
  for (const t of tasks ?? []) {
    const aptType = (t.apartment as { type?: string } | null)?.type ?? 'senior';
    const stay = t.stay as { source?: string } | null;
    const booking = t.booking as { rental_type?: string } | null;

    let source: 'cityus' | 'booking' | 'own' = 'own';
    if (stay?.source === 'cityus') source = 'cityus';
    else if (booking?.rental_type === 'booking') source = 'booking';

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
  revalidatePath('/cleaning/weekly');
  return { ok: true, updated, unchanged, total: (tasks ?? []).length };
}
