'use server';

import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { todayIso } from '@/lib/dates';
import {
  parseCityusSheet,
  type CityusPlanRow,
} from '@/services/cleaning/cityus-parser';
import { estimateDurationMinutes } from '@/services/cleaning/duration';

export interface CityusPreviewRow extends CityusPlanRow {
  apartment_id: string | null; // null wenn nicht im System
  apartment_type: string | null;
  existsAlready: boolean; // schon ein Cityus-Auftrag am gleichen Tag fuer die Wohnung?
}

export interface CityusPreviewResult {
  ok: boolean;
  error?: string;
  rows?: CityusPreviewRow[];
  warnings?: string[];
}

export async function previewCityusImport(
  formData: FormData,
): Promise<CityusPreviewResult> {
  await requireRole(['admin', 'office']);
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Keine Datei.' };

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
  }) as (string | number | Date | null | undefined)[][];

  const { rows, warnings } = parseCityusSheet(matrix);

  const supabase = await createSupabaseServerClient();
  const aptNumbers = [...new Set(rows.map((r) => r.apartmentNumber).filter(Boolean))] as string[];

  const { data: apts } = aptNumbers.length
    ? await supabase
        .from('apartments')
        .select('id, number, type')
        .in('number', aptNumbers)
    : { data: [] };
  const aptByNumber = new Map((apts ?? []).map((a) => [a.number, a]));

  // Existieren schon Cityus-Auftraege am gleichen Tag fuer diese Wohnungen?
  const checkPairs = rows
    .map((r) => ({ apt: aptByNumber.get(r.apartmentNumber ?? '')?.id, date: r.date }))
    .filter((p) => p.apt);
  const apartmentIds = [...new Set(checkPairs.map((p) => p.apt!))];
  const dates = [...new Set(checkPairs.map((p) => p.date))];
  const { data: existing } = apartmentIds.length
    ? await supabase
        .from('cleaning_tasks')
        .select('apartment_id, scheduled_date')
        .eq('source', 'cityus')
        .in('apartment_id', apartmentIds)
        .in('scheduled_date', dates)
    : { data: [] };
  const existingKey = new Set(
    (existing ?? []).map((e) => `${e.apartment_id}|${e.scheduled_date}`),
  );

  const previewRows: CityusPreviewRow[] = rows.map((r) => {
    const apt = aptByNumber.get(r.apartmentNumber ?? '') ?? null;
    return {
      ...r,
      apartment_id: apt?.id ?? null,
      apartment_type: apt?.type ?? null,
      existsAlready: apt
        ? existingKey.has(`${apt.id}|${r.date}`)
        : false,
    };
  });

  return { ok: true, rows: previewRows, warnings };
}

// ── apply ──────────────────────────────────────────────────────────────

export interface CityusApplyResult {
  ok: boolean;
  error?: string;
  removed?: number;
  created?: number;
  skippedPast?: number;
  skippedUnknown?: number;
}

/**
 * Wendet einen zuvor gepreviewten Plan an:
 *  - Loescht alle existierenden Cityus-Auftraege mit scheduled_date >= heute,
 *    deren (apartment, date) NICHT im neuen Plan vorkommt
 *    (= Cityus hat etwas gestrichen).
 *  - Insertet neue (apartment, date)-Kombinationen die noch nicht existieren.
 *  - Bestehende Auftraege werden NICHT ueberschrieben (Office hat ggf. den
 *    Status schon geaendert).
 *  - Vergangene Cityus-Auftraege bleiben unangetastet (Idempotenz).
 */
export async function applyCityusImport(
  rowsJson: string,
): Promise<CityusApplyResult> {
  await requireRole(['admin', 'office']);
  const rows: CityusPreviewRow[] = JSON.parse(rowsJson);
  const supabase = await createSupabaseServerClient();
  const today = todayIso();

  const valid = rows.filter((r) => r.apartment_id);
  const skippedUnknown = rows.length - valid.length;

  // Zukunfts-Eintraege im neuen Plan
  const future = valid.filter((r) => r.date >= today);
  const skippedPast = valid.length - future.length;

  const futureKeys = new Set(future.map((r) => `${r.apartment_id}|${r.date}`));

  // Alle vorhandenen Cityus-Auftraege ab heute holen
  const { data: existing } = await supabase
    .from('cleaning_tasks')
    .select('id, apartment_id, scheduled_date, status')
    .eq('source', 'cityus')
    .gte('scheduled_date', today);

  // Loeschen: existing die nicht (mehr) im neuen Plan stehen UND noch nicht
  // begonnen wurden (status='open'). Status 'in_progress'/'done' bleiben.
  const removeIds: string[] = [];
  for (const e of existing ?? []) {
    const key = `${e.apartment_id}|${e.scheduled_date}`;
    if (!futureKeys.has(key) && e.status === 'open') {
      removeIds.push(e.id);
    }
  }
  let removed = 0;
  if (removeIds.length) {
    const { error } = await supabase
      .from('cleaning_tasks')
      .delete()
      .in('id', removeIds);
    if (error) return { ok: false, error: error.message };
    removed = removeIds.length;
  }

  // Einfuegen: neue (apartment, date)-Kombinationen
  const existingKeys = new Set(
    (existing ?? []).map((e) => `${e.apartment_id}|${e.scheduled_date}`),
  );
  let created = 0;
  for (const r of future) {
    if (!r.apartment_id) continue;
    const key = `${r.apartment_id}|${r.date}`;
    if (existingKeys.has(key)) continue; // schon vorhanden, nicht doppelt anlegen
    const duration = estimateDurationMinutes(
      r.type === 'weekly_clean' || r.type === 'weekly_clean_linen' ? 'cityus' : 'booking',
      r.apartment_type ?? 'senior',
      r.type,
    );
    const noteParts = [
      r.guestName ? `Gast: ${r.guestName}` : null,
      r.rawAction ? `Aktion: ${r.rawAction}` : null,
      `Cityus-Import ${today}`,
    ].filter(Boolean);
    const { error } = await supabase.from('cleaning_tasks').insert({
      apartment_id: r.apartment_id,
      scheduled_date: r.date,
      type: r.type,
      priority: 'normal',
      status: 'open',
      estimated_duration_minutes: duration,
      linen_change: r.linen_change,
      source: 'cityus',
      notes: noteParts.join(' · '),
    });
    if (!error) created++;
  }

  revalidatePath('/cleaning');
  revalidatePath('/cleaning/daily');
  revalidatePath('/cleaning/weekly');
  revalidatePath('/dashboard');

  return {
    ok: true,
    removed,
    created,
    skippedPast,
    skippedUnknown,
  };
}
