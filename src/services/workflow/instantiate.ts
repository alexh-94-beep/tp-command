import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import type { TaskDueAnchor } from '@/types/aliases';
import { addDaysIso, OPEN_END_DATE } from '@/lib/dates';

// ── Pure helpers (testbar) ─────────────────────────────────────────────

export interface BookingDates {
  start_date: string;
  /** ISO oder 9999-12-31 (Sentinel fuer unbefristet) */
  end_date: string;
  /** ISO YYYY-MM-DD */
  created_iso: string;
}

/**
 * Berechnet das Faelligkeitsdatum einer Aufgabe basierend auf Anker + Offset.
 * Bei unbefristeten Vertraegen (Sentinel 9999-12-31) liefert anchor=check_out
 * bewusst null, weil es kein Auszugsdatum gibt.
 */
export function computeDueDate(
  anchor: TaskDueAnchor,
  offsetDays: number,
  dates: BookingDates,
): string | null {
  if (anchor === 'check_in') {
    return addDaysIso(dates.start_date, offsetDays);
  }
  if (anchor === 'check_out') {
    if (!dates.end_date || dates.end_date.startsWith('9999-')) return null;
    return addDaysIso(dates.end_date, offsetDays);
  }
  return addDaysIso(dates.created_iso, offsetDays);
}

/**
 * Workflow-Bedingungen evaluieren. Aktuell unterstuetzt:
 *  - parking_included: 'na' wenn Buchung keinen Parkplatz hat
 *  - damage_found: bleibt 'open' (Schaden erst nach Inspektion bekannt)
 */
export function evaluateConditionalStatus(
  conditionKey: string | null,
  context: { parking_included: boolean },
): 'open' | 'na' {
  if (conditionKey === 'parking_included' && !context.parking_included) return 'na';
  return 'open';
}

// ── Service ────────────────────────────────────────────────────────────

/**
 * Instantiiert die Aufgaben-Templates fuer eine Buchung.
 *
 * - Laedt alle aktiven Templates mit passendem `scope` (rental_type oder 'all')
 *   und kind in (move_in, move_out).
 * - Erzeugt fuer jede Template-Aufgabe einen booking_tasks Eintrag, sofern
 *   noch nicht vorhanden (idempotent via UNIQUE INDEX (booking_id, kind, code)).
 * - Bedingte Aufgaben bekommen Status 'na', wenn Bedingung nicht erfuellt.
 * - Faelligkeitsdaten via computeDueDate (anchor + offset).
 */
export async function instantiateBookingTasks(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<{ created: number; skipped: number; error?: string }> {
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, rental_type, start_date, end_date, parking_included, created_at')
    .eq('id', bookingId)
    .single();
  if (bErr || !booking)
    return { created: 0, skipped: 0, error: bErr?.message ?? 'Buchung nicht gefunden' };

  const { data: templates, error: tErr } = await supabase
    .from('workflow_templates')
    .select('id, code, kind, scope, is_active')
    .eq('is_active', true)
    .in('scope', [booking.rental_type, 'all']);
  if (tErr) return { created: 0, skipped: 0, error: tErr.message };
  if (!templates || templates.length === 0) return { created: 0, skipped: 0 };

  const tplIds = templates.map((t) => t.id);
  const { data: tplTasks, error: tttErr } = await supabase
    .from('workflow_template_tasks')
    .select(
      'id, template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key',
    )
    .in('template_id', tplIds)
    .order('position', { ascending: true });
  if (tttErr) return { created: 0, skipped: 0, error: tttErr.message };
  if (!tplTasks || tplTasks.length === 0) return { created: 0, skipped: 0 };

  // Bestehende Codes pro kind (Idempotenz)
  const { data: existing } = await supabase
    .from('booking_tasks')
    .select('code, kind')
    .eq('booking_id', bookingId);
  const existingKeys = new Set((existing ?? []).map((e) => `${e.kind}::${e.code}`));

  const templateKindMap = new Map(templates.map((t) => [t.id, t.kind]));

  const dates: BookingDates = {
    start_date: booking.start_date,
    end_date: booking.end_date ?? OPEN_END_DATE,
    created_iso: booking.created_at.slice(0, 10),
  };

  const rows = [];
  let skipped = 0;

  for (const tt of tplTasks) {
    const kind = templateKindMap.get(tt.template_id);
    if (!kind) {
      skipped += 1;
      continue;
    }
    const key = `${kind}::${tt.code}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const status = tt.is_conditional
      ? evaluateConditionalStatus(tt.condition_key, {
          parking_included: booking.parking_included,
        })
      : 'open';

    rows.push({
      booking_id: bookingId,
      template_task_id: tt.id,
      template_id: tt.template_id,
      kind,
      position: tt.position,
      code: tt.code,
      title: tt.title,
      description: tt.description,
      category: tt.category,
      due_date: computeDueDate(tt.due_anchor, tt.due_offset_days, dates),
      due_anchor: tt.due_anchor,
      status,
      is_optional: tt.is_optional,
      is_conditional: tt.is_conditional,
      condition_key: tt.condition_key,
    });
  }

  if (rows.length === 0) return { created: 0, skipped };

  const { error: insErr } = await supabase.from('booking_tasks').insert(rows);
  if (insErr) return { created: 0, skipped, error: insErr.message };

  return { created: rows.length, skipped };
}

/**
 * Aktualisiert Faelligkeitsdaten aller offenen Aufgaben einer Buchung
 * (wenn sich start_date / end_date geaendert hat).
 *
 * Optimiert: ein SELECT mit Template-Join, dann gruppiert nach berechnetem
 * due_date und EIN UPDATE pro Gruppe via .in('id', [...]). Statt N+1
 * Roundtrips brauchen wir nun typischerweise 2-5 — viele Tasks teilen
 * dasselbe Datum (z.B. alle offset=0+anchor=check_in).
 */
export async function recomputeBookingTaskDueDates(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<{ updated: number; error?: string }> {
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, start_date, end_date, created_at')
    .eq('id', bookingId)
    .single();
  if (bErr || !booking) return { updated: 0, error: bErr?.message };

  // Tasks + Template-Offset in einem Roundtrip (Embedded resource via PostgREST)
  const { data: tasks, error: tErr } = await supabase
    .from('booking_tasks')
    .select(
      'id, due_anchor, template_task_id, workflow_template_tasks!template_task_id(due_offset_days)',
    )
    .eq('booking_id', bookingId)
    .in('status', ['open', 'in_progress']);
  if (tErr) return { updated: 0, error: tErr.message };
  if (!tasks || tasks.length === 0) return { updated: 0 };

  const dates: BookingDates = {
    start_date: booking.start_date,
    end_date: booking.end_date ?? OPEN_END_DATE,
    created_iso: booking.created_at.slice(0, 10),
  };

  // Gruppieren nach neu berechnetem due_date
  const byDueDate = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.template_task_id) continue; // manuelle Aufgabe — nicht antasten
    if (!t.due_anchor) continue;
    const tpl = t.workflow_template_tasks;
    if (!tpl) continue;
    const offset = tpl.due_offset_days ?? 0;
    const due = computeDueDate(t.due_anchor, offset, dates);
    const key = due ?? '__NULL__';
    const arr = byDueDate.get(key) ?? [];
    arr.push(t.id);
    byDueDate.set(key, arr);
  }

  let updated = 0;
  for (const [key, ids] of byDueDate) {
    const value = key === '__NULL__' ? null : key;
    const { error: uErr } = await supabase
      .from('booking_tasks')
      .update({ due_date: value })
      .in('id', ids);
    if (!uErr) updated += ids.length;
  }

  return { updated };
}
