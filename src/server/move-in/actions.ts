'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';

/* -------------------------------------------------- *
 *  Übergabe planen / Plan löschen                     *
 * -------------------------------------------------- */
export async function planMoveIn(input: { bookingId: string; plannedAtIso: string }) {
  await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('bookings')
    .update({ move_in_planned_at: input.plannedAtIso })
    .eq('id', input.bookingId);
  if (error) return { ok: false, error: `Plan speichern: ${error.message}` };

  // Workflow-Aufgabe 'schedule_handover' (move_in) ggf. als done markieren
  await markWorkflowDone(supabase, input.bookingId, 'move_in', 'schedule_handover');

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

export async function clearMoveInPlan(bookingId: string) {
  await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('bookings')
    .update({ move_in_planned_at: null })
    .eq('id', bookingId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}

/* -------------------------------------------------- *
 *  Übergabe erledigt + optionales Protokoll           *
 * -------------------------------------------------- */
export interface MarkMoveInDoneInput {
  bookingId: string;
  pdfBase64?: string;
  pdfFilename?: string;
}

export async function markMoveInDone(input: MarkMoveInDoneInput) {
  const user = await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, apartment_id, tenant_id')
    .eq('id', input.bookingId)
    .single();
  if (error || !booking) return { ok: false, error: error?.message ?? 'Buchung nicht gefunden' };

  // Übergabe markieren + check_in_status auf completed setzen
  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('bookings')
    .update({
      move_in_completed_at: nowIso,
      move_in_by: user.id,
      check_in_status: 'completed',
    })
    .eq('id', input.bookingId);
  if (updErr) return { ok: false, error: updErr.message };

  // Protokoll-PDF speichern
  if (input.pdfBase64 && input.pdfFilename) {
    try {
      const buf = Buffer.from(input.pdfBase64, 'base64');
      const path = `move-in/${booking.id}/${input.pdfFilename}`;
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

  // Workflow-Aufgabe 'do_handover' (move_in) als done markieren
  await markWorkflowDone(supabase, input.bookingId, 'move_in', 'do_handover');

  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/dashboard');
  revalidatePath('/tasks');
  return { ok: true };
}

export async function undoMoveIn(bookingId: string) {
  await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('bookings')
    .update({
      move_in_completed_at: null,
      move_in_by: null,
      check_in_status: 'pending',
    })
    .eq('id', bookingId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}

/* -------------------------------------------------- *
 *  Helper: Workflow-Task synchron auf 'done' setzen   *
 * -------------------------------------------------- */
async function markWorkflowDone(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  bookingId: string,
  kind: 'move_in' | 'move_out',
  code: string,
) {
  // Nur wenn sie noch offen ist – nichts überschreiben
  await supabase
    .from('booking_tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
    })
    .eq('booking_id', bookingId)
    .eq('kind', kind)
    .eq('code', code)
    .in('status', ['open', 'in_progress']);
}
