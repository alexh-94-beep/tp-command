import * as XLSX from 'xlsx';

/**
 * Phase 24: Parser fuer den W&W-Mieterspiegel-XLS-Export.
 *
 * Format (vereinfacht):
 *   - Spalte 0: PP-Nr (number)
 *   - Spalte 1: "Einstellplatz Nr. <N>"
 *   - Spalte 6: "<KdNr> <Mietername>"  (z.B. "10012 Szczepan Kras")
 *   - Spalte 13: "DD.MM.YYYY - <DD.MM.YYYY|offen>"
 *   - Spalte 23: Netto-Miete
 *   - "Liegenschaft <Nr>: <Adresse>" als Section-Header (Spalte 0)
 *
 * Der Parser ist tolerant: Zeilen ohne PP-Nr werden ignoriert; Header-
 * Zeilen erkannt; Subtotal-Zeilen ignoriert.
 */

export interface ParkingSpiegelRow {
  number: number;
  buildingLabel: string | null;
  tenantLabel: string | null;
  externalRef: string | null;
  startDate: string | null;
  endDate: string | null;
  monthlyRent: number | null;
}

export interface ParkingImportPreview {
  rows: ParkingSpiegelRow[];
  // Lueckenanalyse fuer den Range min..max: welche Nrn fehlen?
  gaps: number[];
  // PP-Nrn, die im Export mehrfach vorkommen (Anomalie)
  duplicates: number[];
  exportDate: string | null;
  errors: string[];
}

/**
 * Liest "DD.MM.YYYY" und gibt ISO YYYY-MM-DD zurueck, oder null.
 */
export function parseGermanDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || /offen/i.test(s)) return null;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * "DD.MM.YYYY - DD.MM.YYYY" oder "DD.MM.YYYY - offen"
 *   → { startDate, endDate }; endDate ist null fuer "offen".
 */
export function parseMietverhaeltnis(
  raw: unknown,
): { startDate: string | null; endDate: string | null } {
  if (typeof raw !== 'string') return { startDate: null, endDate: null };
  const parts = raw.split(/\s*-\s*/);
  if (parts.length !== 2) return { startDate: null, endDate: null };
  return {
    startDate: parseGermanDate(parts[0]),
    endDate: parseGermanDate(parts[1]),
  };
}

/**
 * "10012 Szczepan Kras" → { externalRef: "10012", tenantLabel: "Szczepan Kras" }
 * "Leerstand" → { externalRef: null, tenantLabel: "Leerstand" }
 */
export function splitTenantLabel(
  raw: unknown,
): { externalRef: string | null; tenantLabel: string | null } {
  if (typeof raw !== 'string') return { externalRef: null, tenantLabel: null };
  const s = raw.trim();
  if (!s) return { externalRef: null, tenantLabel: null };
  const m = s.match(/^(\d{4,6})\s+(.+)$/);
  if (m) return { externalRef: m[1], tenantLabel: m[2].trim() };
  return { externalRef: null, tenantLabel: s };
}

/**
 * Findet "Liegenschaft 25: Sonnentalstrasse 13-17, 8600 Dübendorf"
 * → liefert den ganzen String als label, bleibt sonst null.
 */
function findBuildingLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s.startsWith('Liegenschaft ')) return s;
  return null;
}

/**
 * Findet das Stichtagsdatum aus den ersten Zeilen ("per 17.06.2026").
 */
function findExportDate(rows: unknown[][]): string | null {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    for (const cell of rows[i]) {
      if (typeof cell !== 'string') continue;
      const m = cell.match(/per\s+(\d{1,2}\.\d{1,2}\.\d{4})/);
      if (m) return parseGermanDate(m[1]);
    }
  }
  return null;
}

export function parseParkingSpiegelXlsx(
  buffer: ArrayBuffer | Buffer,
): ParkingImportPreview {
  const result: ParkingImportPreview = {
    rows: [],
    gaps: [],
    duplicates: [],
    exportDate: null,
    errors: [],
  };

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } catch (e) {
    result.errors.push(`XLS nicht lesbar: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }
  if (!wb.SheetNames.length) {
    result.errors.push('Keine Tabellenblaetter im XLS gefunden.');
    return result;
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  result.exportDate = findExportDate(raw);

  let currentBuilding: string | null = null;
  const seen = new Map<number, number>(); // nr → row count
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const buildingHit = findBuildingLabel(row[0]);
    if (buildingHit) {
      currentBuilding = buildingHit;
      continue;
    }
    const nr = row[0];
    const desc = row[1];
    if (typeof nr !== 'number') continue;
    if (typeof desc !== 'string' || !desc.startsWith('Einstellplatz')) continue;

    seen.set(nr, (seen.get(nr) ?? 0) + 1);
    const tenant = splitTenantLabel(row[6]);
    const verh = parseMietverhaeltnis(row[13]);
    const rentRaw = row[23];
    const monthlyRent =
      typeof rentRaw === 'number' && rentRaw > 0 ? rentRaw : null;

    result.rows.push({
      number: nr,
      buildingLabel: currentBuilding,
      tenantLabel: tenant.tenantLabel,
      externalRef: tenant.externalRef,
      startDate: verh.startDate,
      endDate: verh.endDate,
      monthlyRent,
    });
  }

  // Lueckenanalyse: alle fehlenden Nrn zwischen min und max
  if (result.rows.length > 0) {
    const numbers = result.rows.map((r) => r.number);
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const set = new Set(numbers);
    for (let n = min; n <= max; n++) {
      if (!set.has(n)) result.gaps.push(n);
    }
  }
  for (const [nr, count] of seen) {
    if (count > 1) result.duplicates.push(nr);
  }

  return result;
}
