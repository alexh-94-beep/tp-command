'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { parseApartmentsXlsx, type ParsedApartmentRow } from '@/services/import/apartments';

export interface ImportPreviewResult {
  ok: boolean;
  error?: string;
  totalRows?: number;
  newRows?: number;
  existingRows?: number;
  warnings?: { rowNumber: number; field: string; message: string }[];
  preview?: (ParsedApartmentRow & { exists: boolean })[];
}

export interface ImportCommitResult {
  ok: boolean;
  error?: string;
  inserted?: number;
  updated?: number;
}

/** Dry-Run: liest die Datei, gibt Vorschau zurück, schreibt nichts. */
export async function previewApartmentsImport(formData: FormData): Promise<ImportPreviewResult> {
  await requireRole(['admin', 'office']);

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, error: 'Keine Datei hochgeladen.' };
  }

  let parsed;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parseApartmentsXlsx(buf);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = createSupabaseServerClient();
  const numbers = parsed.rows.map((r) => r.number);

  const { data: existing, error: existingErr } = await supabase
    .from('apartments')
    .select('number')
    .in('number', numbers);

  if (existingErr) return { ok: false, error: existingErr.message };

  const existingSet = new Set((existing ?? []).map((r) => r.number));

  const preview = parsed.rows.map((r) => ({ ...r, exists: existingSet.has(r.number) }));

  return {
    ok: true,
    totalRows: parsed.rows.length,
    existingRows: preview.filter((r) => r.exists).length,
    newRows: preview.filter((r) => !r.exists).length,
    warnings: parsed.warnings,
    preview,
  };
}

/**
 * Commit: schreibt die Wohnungen.
 * Modus:
 *  - 'new_only': nur neue Wohnungen anlegen, bestehende überspringen
 *  - 'upsert':   neue anlegen, bestehende per Wohnungsnummer aktualisieren
 */
export async function commitApartmentsImport(formData: FormData): Promise<ImportCommitResult> {
  await requireRole(['admin', 'office']);

  const file = formData.get('file');
  const mode = (formData.get('mode') as string) ?? 'new_only';

  if (!(file instanceof File)) {
    return { ok: false, error: 'Keine Datei hochgeladen.' };
  }

  let parsed;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parseApartmentsXlsx(buf);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = createSupabaseServerClient();

  // Daten in DB-Form bringen
  const records = parsed.rows.map((r) => ({
    number: r.number,
    building: r.building,
    type: r.type,
    size_sqm: r.size_sqm,
    floor: r.floor,
    orientation: r.orientation,
    standard_rent: r.standard_rent,
    status: r.status,
    ownership: r.ownership,
    furnishing_completion: r.furnishing_completion,
    name_tag_status: r.name_tag_status,
    allowed_rental_types: r.allowed_rental_types,
    current_tenant_label: r.current_tenant_text,
    current_move_in: r.current_move_in,
    current_move_out: r.current_move_out,
  }));

  let inserted = 0;
  let updated = 0;

  if (mode === 'upsert') {
    const { data, error } = await supabase
      .from('apartments')
      .upsert(records, { onConflict: 'number' })
      .select('id');
    if (error) return { ok: false, error: error.message };
    updated = data?.length ?? 0;
  } else {
    const { data: existing, error: existErr } = await supabase
      .from('apartments')
      .select('number')
      .in('number', records.map((r) => r.number));
    if (existErr) return { ok: false, error: existErr.message };
    const existingSet = new Set((existing ?? []).map((r) => r.number));
    const newRecords = records.filter((r) => !existingSet.has(r.number));
    if (newRecords.length > 0) {
      const { data, error } = await supabase
        .from('apartments')
        .insert(newRecords)
        .select('id');
      if (error) return { ok: false, error: error.message };
      inserted = data?.length ?? 0;
    }
  }

  revalidatePath('/apartments');
  revalidatePath('/dashboard');

  return { ok: true, inserted, updated };
}
