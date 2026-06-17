import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import type { ParkingSpiegelRow } from '@/services/import/parking';

export interface ApplyImportResult {
  spotsInserted: number;
  spotsUpdated: number;
  assignmentsInserted: number;
  assignmentsUpdated: number;
  assignmentsDeactivated: number;
  gapsInserted: number;
  errors: string[];
}

/**
 * Wendet einen W&W-Mieterspiegel-Import auf die DB an.
 *
 * Regeln:
 *  - parking_spots: pro number upsert. building_label aus W&W ueberschreibt.
 *    is_booking_pool und notes_internal werden NIE ueberschrieben (Tool-Owned).
 *  - W&W-Belegungen (long_term, source='w_w'): pro spot deaktivieren wir
 *    aktive Eintraege deren Mieter-Nr im neuen Import fehlt oder anders
 *    ist, und legen die neue an. Identische bleiben unangetastet.
 *  - Booking-Belegungen (kind='booking') bleiben ABSOLUT unangetastet —
 *    das Tool ist die Source of Truth dafuer.
 *  - Luecken (gaps): werden als parking_spots ohne assignment angelegt
 *    (Leerstand-PP, die W&W nicht exportiert).
 *
 * Nicht-transaktional: wir wenden pro Zeile an. Wenn ein Insert/Update
 * fehlschlaegt, sammeln wir den Fehler und gehen weiter.
 */
export async function applyParkingImport(
  supabase: SupabaseClient<Database>,
  rows: ParkingSpiegelRow[],
  gaps: number[],
): Promise<ApplyImportResult> {
  const result: ApplyImportResult = {
    spotsInserted: 0,
    spotsUpdated: 0,
    assignmentsInserted: 0,
    assignmentsUpdated: 0,
    assignmentsDeactivated: 0,
    gapsInserted: 0,
    errors: [],
  };

  // ── parking_spots upserten ─────────────────────────────────────────
  const allNumbers = [...rows.map((r) => r.number), ...gaps];
  const { data: existingSpots } = await supabase
    .from('parking_spots')
    .select('id, number, building_label')
    .in('number', allNumbers);
  const spotByNumber = new Map(
    (existingSpots ?? []).map((s) => [s.number, s]),
  );

  for (const row of rows) {
    const existing = spotByNumber.get(row.number);
    if (existing) {
      if (existing.building_label !== row.buildingLabel) {
        const { error } = await supabase
          .from('parking_spots')
          .update({ building_label: row.buildingLabel })
          .eq('id', existing.id);
        if (error) result.errors.push(`spot ${row.number}: ${error.message}`);
        else result.spotsUpdated += 1;
      }
    } else {
      const { data: ins, error } = await supabase
        .from('parking_spots')
        .insert({
          number: row.number,
          building_label: row.buildingLabel,
          is_active: true,
        })
        .select('id, number, building_label')
        .single();
      if (error) result.errors.push(`spot ${row.number}: ${error.message}`);
      else if (ins) {
        spotByNumber.set(ins.number, ins);
        result.spotsInserted += 1;
      }
    }
  }

  // Gaps als reine Leerstand-Spots
  for (const nr of gaps) {
    if (spotByNumber.has(nr)) continue;
    const { error } = await supabase
      .from('parking_spots')
      .insert({
        number: nr,
        building_label:
          rows[0]?.buildingLabel ?? null /* uebernimm Liegenschaft */,
        is_active: true,
        notes_internal: 'Leerstand (im W&W-Mieterspiegel nicht exportiert)',
      });
    if (error) result.errors.push(`gap-spot ${nr}: ${error.message}`);
    else result.gapsInserted += 1;
  }

  // ── parking_assignments (kind='long_term', source='w_w') angleichen ─
  const spotIds = Array.from(spotByNumber.values()).map((s) => s.id);
  if (spotIds.length === 0) return result;

  const { data: existingAssignments } = await supabase
    .from('parking_assignments')
    .select(
      'id, parking_spot_id, kind, source, tenant_label, external_ref, start_date, end_date, monthly_rent, is_active',
    )
    .in('parking_spot_id', spotIds)
    .eq('kind', 'long_term')
    .eq('source', 'w_w')
    .eq('is_active', true);

  type ExistingAssignment = NonNullable<typeof existingAssignments>[number];
  const activeWwByExternalRef = new Map<string, ExistingAssignment>();
  if (existingAssignments) {
    for (const a of existingAssignments) {
      activeWwByExternalRef.set(`${a.parking_spot_id}|${a.external_ref ?? ''}`, a);
    }
  }

  const FAR_FUTURE = '2099-12-31'; // 'offen' → far future, fuers EXCLUDE-Constraint

  for (const row of rows) {
    const spot = spotByNumber.get(row.number);
    if (!spot) continue;
    if (!row.startDate) continue; // ohne Startdatum kein W&W-Eintrag
    const endDate = row.endDate ?? FAR_FUTURE;
    const key = `${spot.id}|${row.externalRef ?? ''}`;
    const match = activeWwByExternalRef.get(key);
    if (match) {
      // Schon vorhanden: pruefen ob Daten/Miete drifteten
      const drift =
        match.tenant_label !== row.tenantLabel ||
        match.start_date !== row.startDate ||
        match.end_date !== endDate ||
        Number(match.monthly_rent ?? 0) !== Number(row.monthlyRent ?? 0);
      if (drift) {
        const { error } = await supabase
          .from('parking_assignments')
          .update({
            tenant_label: row.tenantLabel,
            start_date: row.startDate,
            end_date: endDate,
            monthly_rent: row.monthlyRent,
          })
          .eq('id', match.id);
        if (error)
          result.errors.push(`assignment update ${row.number}: ${error.message}`);
        else result.assignmentsUpdated += 1;
      }
      activeWwByExternalRef.delete(key);
      continue;
    }
    // Vorher andere/keine W&W-Belegung: deaktiviere veralteten Eintrag,
    // dann lege neuen an.
    const stalePerSpot = (existingAssignments ?? []).filter(
      (a) => a.parking_spot_id === spot.id,
    );
    for (const stale of stalePerSpot) {
      const { error } = await supabase
        .from('parking_assignments')
        .update({ is_active: false, end_date: row.startDate })
        .eq('id', stale.id)
        .eq('is_active', true);
      if (!error) result.assignmentsDeactivated += 1;
      activeWwByExternalRef.delete(`${stale.parking_spot_id}|${stale.external_ref ?? ''}`);
    }

    const { error } = await supabase.from('parking_assignments').insert({
      parking_spot_id: spot.id,
      kind: 'long_term',
      source: 'w_w',
      tenant_label: row.tenantLabel,
      external_ref: row.externalRef,
      start_date: row.startDate,
      end_date: endDate,
      monthly_rent: row.monthlyRent,
      is_active: true,
    });
    if (error)
      result.errors.push(`assignment insert ${row.number}: ${error.message}`);
    else result.assignmentsInserted += 1;
  }

  // Was im Map uebrig ist = aktive W&W-Eintraege, die im neuen Import nicht
  // mehr vorkommen. Deaktivieren (Mieter ausgezogen).
  for (const stale of activeWwByExternalRef.values()) {
    const { error } = await supabase
      .from('parking_assignments')
      .update({ is_active: false })
      .eq('id', stale.id);
    if (!error) result.assignmentsDeactivated += 1;
  }

  return result;
}
