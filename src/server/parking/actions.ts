'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole, getCurrentUser } from '@/lib/auth/session';
import { parseParkingSpiegelXlsx } from '@/services/import/parking';
import { applyParkingImport } from '@/services/parking/apply-import';
import { logAudit } from '@/services/audit/log';

/**
 * Phase 24: Import des W&W-Mieterspiegel-XLS.
 * Erlaubt: admin, office, management.
 */
export async function importParkingSpiegel(
  formData: FormData,
): Promise<{
  ok: boolean;
  error?: string;
  spotsInserted?: number;
  spotsUpdated?: number;
  assignmentsInserted?: number;
  assignmentsUpdated?: number;
  assignmentsDeactivated?: number;
  gapsInserted?: number;
  gaps?: number[];
  exportDate?: string | null;
  errors?: string[];
}> {
  await requireRole(['admin', 'office', 'management']);
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Keine Datei.' };
  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = parseParkingSpiegelXlsx(buf);
  if (parsed.errors.length > 0) {
    return { ok: false, error: parsed.errors.join('; ') };
  }
  const supabase = await createSupabaseServerClient();
  const r = await applyParkingImport(supabase, parsed.rows, parsed.gaps);
  revalidatePath('/parking');
  return {
    ok: true,
    spotsInserted: r.spotsInserted,
    spotsUpdated: r.spotsUpdated,
    assignmentsInserted: r.assignmentsInserted,
    assignmentsUpdated: r.assignmentsUpdated,
    assignmentsDeactivated: r.assignmentsDeactivated,
    gapsInserted: r.gapsInserted,
    gaps: parsed.gaps,
    exportDate: parsed.exportDate,
    errors: r.errors,
  };
}

/**
 * is_booking_pool umschalten — auch fuer Cleaning/Mireme erlaubt.
 */
const setPoolSchema = z.object({
  spot_id: z.string().uuid(),
  is_booking_pool: z.coerce.boolean(),
});

export async function setParkingBookingPool(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'management', 'cleaning']);
  const actor = await getCurrentUser();
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  raw.is_booking_pool = raw.is_booking_pool === 'true' || raw.is_booking_pool === '1';
  const parsed = setPoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const supabase = await createSupabaseServerClient();
  const { data: prev } = await supabase
    .from('parking_spots')
    .select('id, number, is_booking_pool')
    .eq('id', parsed.data.spot_id)
    .maybeSingle();
  if (!prev) return { ok: false, error: 'PP nicht gefunden' };
  if (prev.is_booking_pool === parsed.data.is_booking_pool) return { ok: true };
  const { error } = await supabase
    .from('parking_spots')
    .update({ is_booking_pool: parsed.data.is_booking_pool })
    .eq('id', parsed.data.spot_id);
  if (error) return { ok: false, error: error.message };
  void logAudit(supabase, {
    actorId: actor?.id ?? null,
    entity: 'parking_spot',
    entityId: parsed.data.spot_id,
    action: 'updated',
    diff: {
      is_booking_pool: {
        before: prev.is_booking_pool,
        after: parsed.data.is_booking_pool,
      },
    },
    note: `PP ${prev.number} ${parsed.data.is_booking_pool ? 'als Booking-Pool markiert' : 'aus Booking-Pool entfernt'}`,
  });
  revalidatePath('/parking');
  revalidatePath(`/parking/${parsed.data.spot_id}`);
  return { ok: true };
}

const updateNotesSchema = z.object({
  spot_id: z.string().uuid(),
  notes_internal: z.string().max(2000),
});

export async function updateParkingSpotNotes(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'management', 'cleaning']);
  const actor = await getCurrentUser();
  const parsed = updateNotesSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('parking_spots')
    .update({ notes_internal: parsed.data.notes_internal })
    .eq('id', parsed.data.spot_id);
  if (error) return { ok: false, error: error.message };
  void logAudit(supabase, {
    actorId: actor?.id ?? null,
    entity: 'parking_spot',
    entityId: parsed.data.spot_id,
    action: 'updated',
    note: 'notes_internal geaendert',
  });
  revalidatePath(`/parking/${parsed.data.spot_id}`);
  return { ok: true };
}

/**
 * Neue Booking-Belegung anlegen (kind='booking', source='tp_command').
 * Erlaubt: admin/office/cleaning.
 */
const createBookingAssignmentSchema = z.object({
  spot_id: z.string().uuid(),
  booking_id: z.string().uuid().optional().nullable(),
  tenant_label: z.string().min(1).max(200),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

export async function createBookingParkingAssignment(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  assignmentId?: string;
}> {
  await requireRole(['admin', 'office', 'management', 'cleaning']);
  const actor = await getCurrentUser();
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  if (raw.booking_id === '' || raw.booking_id === undefined) raw.booking_id = null;
  if (raw.notes === '') delete raw.notes;
  const parsed = createBookingAssignmentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  if (parsed.data.end_date <= parsed.data.start_date) {
    return { ok: false, error: 'Auszug muss nach Einzug liegen.' };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('parking_assignments')
    .insert({
      parking_spot_id: parsed.data.spot_id,
      kind: 'booking',
      source: 'tp_command',
      tenant_label: parsed.data.tenant_label,
      booking_id: parsed.data.booking_id ?? null,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      notes: parsed.data.notes ?? null,
      is_active: true,
    })
    .select('id')
    .single();
  if (error) {
    if (error.message.includes('parking_assignments_no_overlap')) {
      return {
        ok: false,
        error:
          'PP ist in diesem Zeitraum bereits belegt. Bitte einen anderen PP oder Zeitraum waehlen.',
      };
    }
    return { ok: false, error: error.message };
  }
  void logAudit(supabase, {
    actorId: actor?.id ?? null,
    entity: 'parking_assignment',
    entityId: data.id,
    action: 'created',
    diff: {
      kind: 'booking',
      spot_id: parsed.data.spot_id,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      booking_id: parsed.data.booking_id ?? null,
      tenant_label: parsed.data.tenant_label,
    },
  });
  revalidatePath('/parking');
  revalidatePath(`/parking/${parsed.data.spot_id}`);
  if (parsed.data.booking_id) {
    revalidatePath(`/bookings/${parsed.data.booking_id}`);
  }
  return { ok: true, assignmentId: data.id };
}

/**
 * Phase 24e: Verfuegbare Booking-Pool-Parkplaetze fuer eine konkrete
 * Buchung (Zeitraum start_date..end_date). Liefert PPs mit
 * is_booking_pool=true und ohne Belegungsueberlappung.
 *
 * Hinweis: `available_for_booking` enthaelt auch PPs, deren W&W-
 * Mietverhaeltnis ueberlappt — der EXCLUDE-Constraint wuerde sie zwar
 * blockieren, aber wir wollen sie ueberhaupt nicht in der Auswahl
 * zeigen, da das Doppelbelegung waere.
 */
export async function getAvailableBookingParkingSpots(
  bookingId: string,
): Promise<{
  ok: boolean;
  error?: string;
  spots?: Array<{ id: string; number: number; warning: string | null }>;
}> {
  await requireRole(['admin', 'office', 'management', 'cleaning']);
  const supabase = await createSupabaseServerClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, start_date, end_date')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) return { ok: false, error: 'Buchung nicht gefunden' };

  const start = booking.start_date;
  const end = booking.end_date;

  const { data: spots } = await supabase
    .from('parking_spots')
    .select(
      'id, number, parking_assignments(kind, tenant_label, start_date, end_date, is_active)',
    )
    .eq('is_booking_pool', true)
    .eq('is_active', true)
    .order('number');

  const result: Array<{ id: string; number: number; warning: string | null }> = [];
  for (const s of spots ?? []) {
    const overlapping = (s.parking_assignments ?? []).filter(
      (a) => a.is_active && a.start_date < end && a.end_date > start,
    );
    if (overlapping.length === 0) {
      result.push({ id: s.id, number: s.number, warning: null });
      continue;
    }
    // Booking-Overlap blockt komplett
    if (overlapping.some((a) => a.kind === 'booking')) continue;
    // Long-term-Overlap: nicht anbieten (Doppelbuchung)
    if (overlapping.some((a) => a.kind === 'long_term')) continue;
    // Nur other_block → mit Warnung
    result.push({
      id: s.id,
      number: s.number,
      warning: 'Hat einen aktiven Block-Eintrag (z.B. Reinigung) im Zeitraum.',
    });
  }
  return { ok: true, spots: result };
}

/**
 * Phase 24e: PP-Zuweisung aus einer booking_parking_assign-Task heraus.
 * Erzeugt parking_assignment + setzt Task auf done.
 */
const assignFromTaskSchema = z.object({
  task_id: z.string().uuid(),
  spot_id: z.string().uuid(),
});

export async function assignBookingParkingFromTask(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
}> {
  await requireRole(['admin', 'office', 'management', 'cleaning']);
  const actor = await getCurrentUser();
  const parsed = assignFromTaskSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: 'Ungueltige Eingabe' };
  const supabase = await createSupabaseServerClient();

  const { data: task } = await supabase
    .from('booking_tasks')
    .select('id, code, status, booking_id')
    .eq('id', parsed.data.task_id)
    .maybeSingle();
  if (!task) return { ok: false, error: 'Aufgabe nicht gefunden' };
  if (task.code !== 'booking_parking_assign') {
    return { ok: false, error: 'Diese Aktion ist nur fuer Parkplatz-Zuweisungs-Aufgaben gedacht.' };
  }
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, start_date, end_date, tenant:tenants(first_name, last_name)')
    .eq('id', task.booking_id)
    .maybeSingle();
  if (!booking) return { ok: false, error: 'Buchung nicht gefunden' };

  const tenantLabel = booking.tenant
    ? `${booking.tenant.first_name} ${booking.tenant.last_name}`.trim()
    : `Buchung ${booking.id.slice(0, 8)}`;

  const { data: spot } = await supabase
    .from('parking_spots')
    .select('id, number')
    .eq('id', parsed.data.spot_id)
    .maybeSingle();
  if (!spot) return { ok: false, error: 'Parkplatz nicht gefunden' };

  const { data: created, error: insErr } = await supabase
    .from('parking_assignments')
    .insert({
      parking_spot_id: parsed.data.spot_id,
      kind: 'booking',
      source: 'tp_command',
      tenant_label: tenantLabel,
      booking_id: booking.id,
      start_date: booking.start_date,
      end_date: booking.end_date,
      is_active: true,
    })
    .select('id')
    .single();
  if (insErr) {
    if (insErr.message.includes('parking_assignments_no_overlap')) {
      return {
        ok: false,
        error: 'PP ist zwischenzeitlich belegt worden. Bitte einen anderen waehlen.',
      };
    }
    return { ok: false, error: insErr.message };
  }

  // Task auf done setzen + Notiz mit PP-Nr ergaenzen
  await supabase
    .from('booking_tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      completed_by: actor?.id ?? null,
      notes: `Parkplatz Nr. ${spot.number} zugewiesen`,
    })
    .eq('id', parsed.data.task_id);

  void logAudit(supabase, {
    actorId: actor?.id ?? null,
    entity: 'parking_assignment',
    entityId: created.id,
    action: 'created',
    diff: {
      spot_number: spot.number,
      booking_id: booking.id,
      tenant_label: tenantLabel,
      start_date: booking.start_date,
      end_date: booking.end_date,
    },
    note: `PP ${spot.number} via Booking-Workflow-Task zugewiesen`,
  });

  revalidatePath(`/bookings/${booking.id}`);
  revalidatePath(`/parking/${parsed.data.spot_id}`);
  revalidatePath('/parking');
  return { ok: true };
}

/**
 * Booking-Belegung deaktivieren (Cancel).
 */
export async function deactivateParkingAssignment(
  assignmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office', 'management', 'cleaning']);
  const actor = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const { data: prev } = await supabase
    .from('parking_assignments')
    .select('id, kind, parking_spot_id, booking_id')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!prev) return { ok: false, error: 'Belegung nicht gefunden' };
  if (prev.kind !== 'booking') {
    return { ok: false, error: 'Nur Booking-Belegungen koennen storniert werden.' };
  }
  const { error } = await supabase
    .from('parking_assignments')
    .update({ is_active: false })
    .eq('id', assignmentId);
  if (error) return { ok: false, error: error.message };
  void logAudit(supabase, {
    actorId: actor?.id ?? null,
    entity: 'parking_assignment',
    entityId: assignmentId,
    action: 'cancelled',
    note: 'Booking-PP-Belegung storniert',
  });
  revalidatePath('/parking');
  revalidatePath(`/parking/${prev.parking_spot_id}`);
  if (prev.booking_id) revalidatePath(`/bookings/${prev.booking_id}`);
  return { ok: true };
}
