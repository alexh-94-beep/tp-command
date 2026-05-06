import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysIso } from '@/lib/dates';

/**
 * Instantiiert die Aufgaben-Templates für eine Buchung.
 *
 * - Lädt alle aktiven Templates mit passendem `scope` (rental_type oder 'all')
 *   und kind in (move_in, move_out).
 * - Erzeugt für jede Template-Aufgabe einen booking_tasks Eintrag, sofern
 *   noch nicht vorhanden (idempotent via UNIQUE INDEX (booking_id, kind, code)).
 * - Bedingte Aufgaben (parking_included, damage_found etc.) werden als
 *   `is_conditional` markiert und bekommen Status 'na', wenn die Bedingung
 *   nicht erfüllt ist.
 * - Fälligkeitsdaten werden anhand des Ankers (created/check_in/check_out)
 *   und `due_offset_days` berechnet.
 *
 * @param supabase Authentifizierter Supabase-Client (server)
 * @param bookingId Buchungs-ID
 * @returns Anzahl neu erzeugter Aufgaben
 */
export async function instantiateBookingTasks(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ created: number; skipped: number; error?: string }> {
  // 1. Buchung laden
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select(
      'id, rental_type, start_date, end_date, parking_included, created_at',
    )
    .eq('id', bookingId)
    .single();
  if (bErr || !booking) {
    return { created: 0, skipped: 0, error: bErr?.message ?? 'Buchung nicht gefunden' };
  }

  // 2. Passende Templates suchen (eigene Mietart + 'all')
  const { data: templates, error: tErr } = await supabase
    .from('workflow_templates')
    .select('id, code, kind, scope, is_active')
    .eq('is_active', true)
    .in('scope', [booking.rental_type as string, 'all']);
  if (tErr) return { created: 0, skipped: 0, error: tErr.message };
  if (!templates || templates.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // 3. Template-Aufgaben laden
  const tplIds = templates.map((t) => t.id as string);
  const { data: tplTasks, error: tttErr } = await supabase
    .from('workflow_template_tasks')
    .select(
      `
      id, template_id, position, code, title, description, category,
      due_offset_days, due_anchor, assignee_role, is_optional,
      is_conditional, condition_key
    `,
    )
    .in('template_id', tplIds)
    .order('position', { ascending: true });
  if (tttErr) return { created: 0, skipped: 0, error: tttErr.message };
  if (!tplTasks || tplTasks.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // 4. Bestehende Codes pro kind ermitteln (um Idempotenz zu garantieren)
  const { data: existing } = await supabase
    .from('booking_tasks')
    .select('code, kind')
    .eq('booking_id', bookingId);
  const existingKeys = new Set(
    (existing ?? []).map((e) => `${e.kind}::${e.code}`),
  );

  // 5. Map template -> kind
  const templateKindMap = new Map<string, 'move_in' | 'move_out'>();
  for (const t of templates) {
    templateKindMap.set(t.id as string, t.kind as 'move_in' | 'move_out');
  }

  // 6. Inserts vorbereiten
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const tt of tplTasks) {
    const kind = templateKindMap.get(tt.template_id as string);
    if (!kind) {
      skipped += 1;
      continue;
    }
    const key = `${kind}::${tt.code}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    // Bedingung evaluieren
    let initialStatus: 'open' | 'na' = 'open';
    if (tt.is_conditional) {
      const ck = tt.condition_key as string | null;
      if (ck === 'parking_included' && !booking.parking_included) {
        initialStatus = 'na';
      }
      // damage_found bleibt 'open' (Schaden ist erst nach Inspektion bekannt;
      // Office kann manuell auf 'na' setzen, sobald klar)
    }

    // Due-Date berechnen
    const anchor = tt.due_anchor as 'created' | 'check_in' | 'check_out';
    const offset = (tt.due_offset_days as number) ?? 0;
    let dueDate: string | null = null;
    if (anchor === 'check_in') {
      dueDate = addDaysIso(booking.start_date as string, offset);
    } else if (anchor === 'check_out') {
      // Bei unbefristeten Verträgen (Sentinel-Datum) → kein Auszugs-Datum
      const eod = booking.end_date as string;
      if (eod && !eod.startsWith('9999-')) {
        dueDate = addDaysIso(eod, offset);
      }
    } else {
      dueDate = addDaysIso(
        (booking.created_at as string).slice(0, 10),
        offset,
      );
    }

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
      due_date: dueDate,
      due_anchor: anchor,
      status: initialStatus,
      is_optional: tt.is_optional,
      is_conditional: tt.is_conditional,
      condition_key: tt.condition_key,
    });
  }

  if (rows.length === 0) {
    return { created: 0, skipped };
  }

  const { error: insErr } = await supabase.from('booking_tasks').insert(rows);
  if (insErr) {
    return { created: 0, skipped, error: insErr.message };
  }

  return { created: rows.length, skipped };
}

/**
 * Aktualisiert Fälligkeitsdaten aller offenen Aufgaben einer Buchung,
 * wenn sich start_date oder end_date geändert hat.
 * Erledigte/übersprungene Aufgaben bleiben unverändert.
 */
export async function recomputeBookingTaskDueDates(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ updated: number; error?: string }> {
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, start_date, end_date, created_at')
    .eq('id', bookingId)
    .single();
  if (bErr || !booking) return { updated: 0, error: bErr?.message };

  const { data: tasks, error: tErr } = await supabase
    .from('booking_tasks')
    .select('id, due_anchor, status')
    .eq('booking_id', bookingId)
    .in('status', ['open', 'in_progress']);
  if (tErr) return { updated: 0, error: tErr.message };
  if (!tasks || tasks.length === 0) return { updated: 0 };

  // Wir brauchen die Original-Offsets aus den Templates → nochmal joinen
  const { data: full } = await supabase
    .from('booking_tasks')
    .select('id, due_anchor, template_task_id')
    .in(
      'id',
      tasks.map((t) => t.id as string),
    );
  const tplIds = (full ?? [])
    .map((t) => t.template_task_id as string | null)
    .filter((x): x is string => !!x);

  const offsetMap = new Map<string, number>();
  if (tplIds.length > 0) {
    const { data: tpls } = await supabase
      .from('workflow_template_tasks')
      .select('id, due_offset_days')
      .in('id', tplIds);
    for (const t of tpls ?? []) {
      offsetMap.set(t.id as string, (t.due_offset_days as number) ?? 0);
    }
  }

  let updated = 0;
  for (const t of full ?? []) {
    const tplId = t.template_task_id as string | null;
    if (!tplId) continue; // Manuelle Aufgabe → nicht antasten
    const offset = offsetMap.get(tplId) ?? 0;
    const anchor = t.due_anchor as 'created' | 'check_in' | 'check_out';
    let dueDate: string | null = null;
    if (anchor === 'check_in') {
      dueDate = addDaysIso(booking.start_date as string, offset);
    } else if (anchor === 'check_out') {
      const eod = booking.end_date as string;
      if (eod && !eod.startsWith('9999-')) {
        dueDate = addDaysIso(eod, offset);
      }
    } else {
      dueDate = addDaysIso(
        (booking.created_at as string).slice(0, 10),
        offset,
      );
    }
    const { error: uErr } = await supabase
      .from('booking_tasks')
      .update({ due_date: dueDate })
      .eq('id', t.id as string);
    if (!uErr) updated += 1;
  }

  return { updated };
}
