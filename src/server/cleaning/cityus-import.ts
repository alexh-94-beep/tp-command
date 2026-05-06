'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { parseCityusPlan, type CityusParseResult, type CityusStayRow } from '@/services/import/cityus';
import { estimateDurationMinutes } from '@/services/cleaning/duration';

export interface WeeklyPreviewRow {
  apartment_number: string;
  guest_name: string;
  date: string;
  task_type: 'weekly_clean' | 'weekly_clean_linen';
  raw_description: string;
  apartment_in_db: boolean;
  duplicate: boolean;          // gleicher (Wohnung+Datum) bereits als Auftrag im System
}

export interface CityusPreview {
  ok: boolean;
  error?: string;
  weekRange?: string | null;
  parsed?: CityusParseResult;
  perRow?: Array<{
    row: CityusStayRow;
    apartment_in_db: boolean;
    existing_stay: boolean;
    parent_booking_id: string | null;
  }>;
  weeklyRows?: WeeklyPreviewRow[];
  warnings?: { rowNumber: number; message: string }[];
}

export async function previewCityusPlan(formData: FormData): Promise<CityusPreview> {
  await requireRole(['admin', 'office']);
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Keine Datei.' };

  let parsed: CityusParseResult;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parseCityusPlan(buf);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = createSupabaseServerClient();
  const aptNumbers = Array.from(
    new Set([
      ...parsed.stays.map((s) => s.apartment_number),
      ...parsed.weeklyTasks.map((w) => w.apartment_number),
    ]),
  );

  const { data: apartments } = await supabase
    .from('apartments')
    .select('id, number')
    .in('number', aptNumbers);
  const aptByNumber = new Map((apartments ?? []).map((a) => [a.number, a.id]));

  // Alle Stays der betroffenen Wohnungen + Gäste laden, unabhängig vom Datum.
  const aptIds = Array.from(new Set(Array.from(aptByNumber.values())));
  const guestNames = Array.from(new Set(parsed.stays.map((s) => s.guest_name)));
  const { data: existing } =
    aptIds.length > 0 && guestNames.length > 0
      ? await supabase
          .from('subleasing_stays')
          .select('id, apartment_id, guest_name, check_in_date, check_out_date')
          .in('apartment_id', aptIds)
          .in('guest_name', guestNames)
      : { data: [] };

  // Hilfsfunktion: gibt es einen existierenden Stay, der zu dieser Zeile passt?
  function findExisting(
    apartmentId: string,
    guest: string,
    ci: string | undefined,
    co: string | undefined,
  ): boolean {
    const candidates = (existing ?? []).filter(
      (e) =>
        e.apartment_id === apartmentId &&
        e.guest_name.toLowerCase() === guest.toLowerCase(),
    );
    if (candidates.length === 0) return false;
    // Match-Reihenfolge: ci+co exakt → ci exakt → co exakt → ci<=our co und co>=our ci → kein
    if (ci && co) {
      if (candidates.some((c) => c.check_in_date === ci && c.check_out_date === co)) return true;
    }
    if (ci) {
      if (candidates.some((c) => c.check_in_date === ci)) return true;
    }
    if (co) {
      if (candidates.some((c) => c.check_out_date === co || c.check_in_date <= co)) return true;
    }
    return false;
  }

  // Aktive Cityus-Buchung pro Wohnung im Zeitraum suchen
  const { data: cityusBookings } = await supabase
    .from('bookings')
    .select('id, apartment_id, start_date, end_date, status, tenants!bookings_tenant_id_fkey(first_name, last_name)')
    .in('status', ['active', 'planned'])
    .in('apartment_id', Array.from(aptByNumber.values()));
  const parentByApt = new Map<string, string>();
  for (const b of cityusBookings ?? []) {
    const t = b.tenants as { first_name?: string; last_name?: string } | null;
    const name = `${t?.first_name ?? ''} ${t?.last_name ?? ''}`.toLowerCase();
    if (name.includes('cityus')) parentByApt.set(b.apartment_id, b.id);
  }

  const perRow = parsed.stays.map((row) => {
    const aptId = aptByNumber.get(row.apartment_number) ?? null;
    return {
      row,
      apartment_in_db: Boolean(aptId),
      existing_stay: aptId
        ? findExisting(aptId, row.guest_name, row.check_in_date, row.check_out_date)
        : false,
      parent_booking_id: aptId ? parentByApt.get(aptId) ?? null : null,
    };
  });

  // Bereits existierende Weekly-Aufträge prüfen — alle weekly_clean Tasks der
  // betroffenen Wohnungen laden, dann pro weekly-Eintrag matchen.
  const weeklyAptIds = Array.from(
    new Set(
      parsed.weeklyTasks
        .map((w) => aptByNumber.get(w.apartment_number))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: existingWeekly } =
    weeklyAptIds.length > 0
      ? await supabase
          .from('cleaning_tasks')
          .select('apartment_id, scheduled_date, type')
          .in('apartment_id', weeklyAptIds)
          .eq('type', 'weekly_clean')
      : { data: [] };
  const existingWeeklyKey = new Set(
    (existingWeekly ?? []).map((e) => `${e.apartment_id}|${e.scheduled_date}`),
  );

  const weeklyRows: WeeklyPreviewRow[] = parsed.weeklyTasks.map((w) => {
    const aptId = aptByNumber.get(w.apartment_number);
    const dupKey = aptId ? `${aptId}|${w.date}` : '';
    return {
      apartment_number: w.apartment_number,
      guest_name: w.guest_name,
      date: w.date,
      task_type: w.task_type as 'weekly_clean' | 'weekly_clean_linen',
      raw_description: w.raw_description,
      apartment_in_db: Boolean(aptId),
      duplicate: existingWeeklyKey.has(dupKey),
    };
  });

  return {
    ok: true,
    weekRange: parsed.weekRange,
    parsed,
    perRow,
    weeklyRows,
    warnings: parsed.warnings,
  };
}

export interface CityusCommitResult {
  ok: boolean;
  error?: string;
  staysInserted?: number;
  staysUpdated?: number;
  cleaningTasksCreated?: number;
  weeklyTasksCreated?: number;
  errors?: string[];
}

export async function commitCityusPlan(formData: FormData): Promise<CityusCommitResult> {
  await requireRole(['admin', 'office']);
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Keine Datei.' };

  let parsed: CityusParseResult;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parseCityusPlan(buf);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = createSupabaseServerClient();

  // Wohnungen für Stays UND Weekly-Tasks laden (inkl. Typ für Dauer-Schätzung)
  const aptNumbers = Array.from(
    new Set([
      ...parsed.stays.map((s) => s.apartment_number),
      ...parsed.weeklyTasks.map((w) => w.apartment_number),
    ]),
  );
  const { data: apartments } = await supabase
    .from('apartments')
    .select('id, number, type')
    .in('number', aptNumbers);
  const aptByNumber = new Map((apartments ?? []).map((a) => [a.number, a.id]));
  const aptTypeById = new Map((apartments ?? []).map((a) => [a.id, a.type as string]));

  // Mireme als Default-Assignee für Inspektionen
  const { data: lead } = await supabase
    .from('cleaning_staff')
    .select('id')
    .eq('is_lead', true)
    .eq('is_active', true)
    .maybeSingle();
  const leadId = lead?.id ?? null;

  const { data: cityusBookings } = await supabase
    .from('bookings')
    .select('id, apartment_id, status, tenants!bookings_tenant_id_fkey(first_name, last_name)')
    .in('status', ['active', 'planned'])
    .in('apartment_id', Array.from(aptByNumber.values()));
  const parentByApt = new Map<string, string>();
  for (const b of cityusBookings ?? []) {
    const t = b.tenants as { first_name?: string; last_name?: string } | null;
    const name = `${t?.first_name ?? ''} ${t?.last_name ?? ''}`.toLowerCase();
    if (name.includes('cityus')) parentByApt.set(b.apartment_id, b.id);
  }

  let staysInserted = 0;
  let staysUpdated = 0;
  let cleaningTasksCreated = 0;
  let weeklyTasksCreated = 0;
  const errors: string[] = [];

  for (const row of parsed.stays) {
    const aptId = aptByNumber.get(row.apartment_number);
    if (!aptId) {
      errors.push(`Zeile ${row.rowNumber}: Wohnung ${row.apartment_number} nicht im Bestand`);
      continue;
    }
    const checkIn = row.check_in_date;
    const checkOut = row.check_out_date;
    if (!checkIn && !checkOut) continue;

    // Bei nur Check-out (Gast aus Vorwoche): existierenden Stay finden und updaten.
    // Bei nur Check-in (Gast bleibt länger): heuristisch +7 Tage als Default-Auszug.
    let ci: string;
    let co: string;

    if (checkIn && checkOut) {
      ci = checkIn;
      co = checkOut;
    } else if (checkIn && !checkOut) {
      ci = checkIn;
      co = addDays(checkIn, 7);
    } else {
      // Nur checkOut: existierenden Stay updaten falls vorhanden, sonst heuristisch
      const { data: prev } = await supabase
        .from('subleasing_stays')
        .select('id, check_in_date, check_out_date')
        .eq('apartment_id', aptId)
        .eq('guest_name', row.guest_name)
        .lte('check_in_date', checkOut!)
        .order('check_in_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prev) {
        // Update den existierenden Stay mit dem korrekten Auszugsdatum
        if (prev.check_out_date !== checkOut) {
          const { error } = await supabase
            .from('subleasing_stays')
            .update({ check_out_date: checkOut })
            .eq('id', prev.id);
          if (error) {
            errors.push(`Update Stay ${row.guest_name}: ${error.message}`);
            continue;
          }
          staysUpdated++;
        }
        // Reinigungs-Aufträge für Auszug erzeugen unten – stayId nutzen
        await ensureCheckoutTasksForStay(supabase, prev.id, aptId, checkOut!, row.guest_name, errors);
        cleaningTasksCreated += 0; // counter wird in helper inkrementiert? – wir lassen es einfach
        continue;
      }
      // Kein Vor-Stay → 7 Tage zurück als Heuristik
      ci = addDays(checkOut!, -7);
      co = checkOut!;
    }

    // Existierender Stay?
    const { data: existing } = await supabase
      .from('subleasing_stays')
      .select('id, check_in_date, check_out_date')
      .eq('apartment_id', aptId)
      .eq('guest_name', row.guest_name)
      .eq('check_in_date', ci)
      .maybeSingle();

    let stayId: string;
    if (existing) {
      const { error } = await supabase
        .from('subleasing_stays')
        .update({ check_out_date: co, source: 'cityus', external_reference: row.apartment_short })
        .eq('id', existing.id);
      if (error) {
        errors.push(`Update Stay ${row.guest_name}: ${error.message}`);
        continue;
      }
      stayId = existing.id;
      staysUpdated++;
    } else {
      const { data: created, error } = await supabase
        .from('subleasing_stays')
        .insert({
          apartment_id: aptId,
          parent_booking_id: parentByApt.get(aptId) ?? null,
          guest_name: row.guest_name,
          check_in_date: ci,
          check_out_date: co,
          source: 'cityus',
          external_reference: row.apartment_short,
        })
        .select('id')
        .single();
      if (error || !created) {
        errors.push(`Insert Stay ${row.guest_name}: ${error?.message}`);
        continue;
      }
      stayId = created.id;
      staysInserted++;
    }

    // Reinigungs-Aufträge automatisch erzeugen (idempotent über stay_id + type)
    const taskTypes: Array<{
      type: 'pre_checkin' | 'inspection' | 'checkout';
      date: string;
      priority: 'normal' | 'high';
      notes: string;
    }> = [];

    if (checkIn) {
      taskTypes.push({
        type: 'pre_checkin',
        date: checkIn,
        priority: 'high',
        notes: `Cityus-Anreise ${row.guest_name}. Vor dem Check-in vorbereiten + Schlüssel in Box.`,
      });
    }
    if (checkOut) {
      taskTypes.push({
        type: 'inspection',
        date: checkOut,
        priority: 'high',
        notes: `Cityus-Abreise ${row.guest_name}. Wohnung prüfen, Schäden erfassen.`,
      });
      taskTypes.push({
        type: 'checkout',
        date: checkOut,
        priority: 'normal',
        notes: `Cityus-Abreise ${row.guest_name}. Reinigung nach Inspektion.`,
      });
    }

    const aptType = aptTypeById.get(aptId) ?? 'senior';
    for (const t of taskTypes) {
      const { data: existingTask } = await supabase
        .from('cleaning_tasks')
        .select('id')
        .eq('subleasing_stay_id', stayId)
        .eq('type', t.type)
        .maybeSingle();
      if (existingTask) continue;
      const minutes = estimateDurationMinutes('cityus', aptType, t.type);
      const { error } = await supabase.from('cleaning_tasks').insert({
        apartment_id: aptId,
        subleasing_stay_id: stayId,
        type: t.type,
        priority: t.priority,
        status: 'open',
        scheduled_date: t.date,
        estimated_duration_minutes: minutes,
        // Inspektionen automatisch an Mireme
        staff_id: t.type === 'inspection' ? leadId : null,
        notes: t.notes,
      });
      if (error) errors.push(`Task ${t.type} für ${row.guest_name}: ${error.message}`);
      else cleaningTasksCreated++;
    }
  }

  // Weekly-Cleans aus Daily Plan
  for (const w of parsed.weeklyTasks) {
    const aptId = aptByNumber.get(w.apartment_number);
    if (!aptId) continue;

    const realType = w.task_type === 'weekly_clean_linen' ? 'weekly_clean_linen' : 'weekly_clean';
    const { data: existing } = await supabase
      .from('cleaning_tasks')
      .select('id')
      .eq('apartment_id', aptId)
      .eq('scheduled_date', w.date)
      .in('type', ['weekly_clean', 'weekly_clean_linen'])
      .maybeSingle();
    if (existing) continue;

    const aptType = aptTypeById.get(aptId) ?? 'senior';
    const minutes = estimateDurationMinutes('cityus', aptType, realType);
    const { error } = await supabase.from('cleaning_tasks').insert({
      apartment_id: aptId,
      type: realType,
      priority: 'normal',
      status: 'open',
      scheduled_date: w.date,
      estimated_duration_minutes: minutes,
      notes:
        `Wöchentliche Reinigung (Cityus): ${w.raw_description}` +
        (w.guest_name ? `\nGast: ${w.guest_name}` : '') +
        (realType === 'weekly_clean_linen' ? '\nMit Wechsel der Bettwäsche.' : ''),
    });
    if (error) errors.push(`Weekly ${w.apartment_number} ${w.date}: ${error.message}`);
    else weeklyTasksCreated++;
  }

  revalidatePath('/cleaning');
  revalidatePath('/dashboard');

  return {
    ok: true,
    staysInserted,
    staysUpdated,
    cleaningTasksCreated,
    weeklyTasksCreated,
    errors,
  };
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function ensureCheckoutTasksForStay(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  stayId: string,
  apartmentId: string,
  checkOutDate: string,
  guestName: string,
  errors: string[],
) {
  for (const t of [
    { type: 'inspection' as const, priority: 'high' as const, notes: `Cityus-Abreise ${guestName}. Wohnung prüfen, Schäden erfassen.` },
    { type: 'checkout' as const, priority: 'normal' as const, notes: `Cityus-Abreise ${guestName}. Reinigung nach Inspektion.` },
  ]) {
    const { data: existing } = await supabase
      .from('cleaning_tasks')
      .select('id')
      .eq('subleasing_stay_id', stayId)
      .eq('type', t.type)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from('cleaning_tasks').insert({
      apartment_id: apartmentId,
      subleasing_stay_id: stayId,
      type: t.type,
      priority: t.priority,
      status: 'open',
      scheduled_date: checkOutDate,
      notes: t.notes,
    });
    if (error) errors.push(`Task ${t.type} für ${guestName}: ${error.message}`);
  }
}
