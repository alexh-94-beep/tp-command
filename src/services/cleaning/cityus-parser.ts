/**
 * Parser fuer den woechentlichen Cityus-Reinigungsplan (Excel).
 *
 * Cityus liefert eine Datei mit dem Aufbau:
 *   - oberer Teil: ARRIVALS + CHECK-OUTS (informativ, nicht importiert)
 *   - unterer Teil: pro Wochentag (Monday/Tuesday/...) ein Block mit
 *     Zeilen [Wochentag, Datum, Apartment-Nr, Wohnungstyp, Gast,
 *     Reinigungs-Aktion]
 *
 * Nur der untere Teil wird importiert (Annahme aus Sitzungs-Notes 12.6.26).
 *
 * Apartment-Mapping: "D703" → "D.0703", "E903" → "E.0903" (Punkt + Pad
 * auf 4 Stellen). Gehoert die Wohnung nicht zu unseren 180, wird der
 * Eintrag im Preview als "unbekannt" markiert — der Import laesst sie
 * weg, Office sieht es aber sofort.
 *
 * Typ-Mapping aus der Aktion-Spalte:
 *   - "final clean"                   → cleaning_type 'checkout'
 *   - "weekly clean & change of linen"→ 'weekly_clean_linen' + linen=true
 *   - "weekly clean" (ohne linen)     → 'weekly_clean'
 *   - sonst                           → 'special'
 */
import type { CleaningType } from '@/types/aliases';

// ── Pure helpers ───────────────────────────────────────────────────────

/**
 * Normalisiert die Cityus-Apartment-Notation auf unsere Wohnungs-Nummer.
 * "D703"  → "D.0703"
 * "E903"  → "E.0903"
 * "D1006" → "D.1006"
 * Gibt null zurueck wenn das Pattern nicht passt.
 */
export function mapApartmentNumber(cityus: string): string | null {
  const trimmed = (cityus ?? '').trim().toUpperCase();
  const m = trimmed.match(/^([CDE])(\d{3,4})$/);
  if (!m) return null;
  const [, letter, num] = m;
  return `${letter}.${num.padStart(4, '0')}`;
}

/**
 * Mappt die Aktion-Spalte auf cleaning_type + linen-Flag.
 * Gross-/Kleinschreibung egal. Whitespace und & toleriert.
 */
export function mapAction(
  raw: string,
): { type: CleaningType; linen_change: boolean } {
  const s = (raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (s.includes('weekly clean') && s.includes('change of linen')) {
    return { type: 'weekly_clean_linen', linen_change: true };
  }
  if (s.includes('weekly clean')) {
    return { type: 'weekly_clean', linen_change: false };
  }
  if (s.includes('final clean')) {
    return { type: 'checkout', linen_change: false };
  }
  return { type: 'special', linen_change: false };
}

/**
 * Erkennt eine Wochentag-Zelle: "Monday", "Tuesday", … (auch lower case).
 */
const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
export function isWeekdayCell(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return WEEKDAYS.includes(value.trim().toLowerCase());
}

/**
 * Konvertiert einen Excel-Date-Cell (Datum-Objekt, Zahl, String) in
 * ISO YYYY-MM-DD. Gibt null zurueck wenn nicht parseable.
 */
export function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    // Excel-Datum kommt ohne Timezone — wir wollen den lokalen Tag, nicht
    // den UTC-Tag, sonst verschiebt sich CEST → 22:00 UTC am Vortag.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'number') {
    // Excel serial: 1 = 1900-01-01, mit Bug fuer 1900 Schaltjahr
    const ms = (value - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    // ISO bereits?
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // DD.MM.YYYY
    const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  return null;
}

// ── Public types ───────────────────────────────────────────────────────

export interface CityusPlanRow {
  date: string; // YYYY-MM-DD
  cityusApartment: string; // Original aus Excel, z.B. "D703"
  apartmentNumber: string | null; // Gemappt z.B. "D.0703" oder null
  guestName: string | null;
  rawAction: string;
  type: CleaningType;
  linen_change: boolean;
}

export interface ParsedCityusPlan {
  rows: CityusPlanRow[];
  warnings: string[];
}

// ── Main parser ────────────────────────────────────────────────────────

/**
 * Parsed ein Cityus-Sheet (als 2D-Array von Zellwerten).
 *
 * Erkennt den "unteren Teil" indem die erste Spalte einen Wochentag
 * enthaelt. Danach werden alle Zeilen bis zum Ende oder bis zum
 * naechsten Block-Trenner verarbeitet — wir nehmen alle Zeilen mit
 * Apartment-Nr (Spalte 2) ab dem ersten gefundenen Weekday.
 */
export function parseCityusSheet(
  matrix: (string | number | Date | null | undefined)[][],
): ParsedCityusPlan {
  const rows: CityusPlanRow[] = [];
  const warnings: string[] = [];

  // Index der ersten Zeile mit Wochentag in Spalte 0 finden
  let startIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    if (isWeekdayCell(matrix[i]?.[0])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    return { rows: [], warnings: ['Kein Wochentag-Block gefunden im Excel.'] };
  }

  // Ab startIdx bis Ende: Zeilen mit Apartment-Nr sind Auftraege
  let currentDate: string | null = null;
  for (let i = startIdx; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    // Datum aus Spalte 1 (rueckt von Zeile zu Zeile fort)
    const newDate = toIsoDate(row[1]);
    if (newDate) currentDate = newDate;

    const cityusApt = row[2];
    if (cityusApt == null || String(cityusApt).trim() === '') continue;
    const cityusAptStr = String(cityusApt).trim();

    const apartmentNumber = mapApartmentNumber(cityusAptStr);
    if (!apartmentNumber) {
      warnings.push(`Zeile ${i + 1}: Apartment "${cityusAptStr}" konnte nicht zugeordnet werden.`);
      continue;
    }
    if (!currentDate) {
      warnings.push(`Zeile ${i + 1}: kein Datum erkannt für ${cityusAptStr}.`);
      continue;
    }

    const guestName = row[4] != null ? String(row[4]).trim() : null;
    const rawAction = row[5] != null ? String(row[5]).trim() : '';
    const { type, linen_change } = mapAction(rawAction);

    rows.push({
      date: currentDate,
      cityusApartment: cityusAptStr,
      apartmentNumber,
      guestName: guestName || null,
      rawAction,
      type,
      linen_change,
    });
  }

  return { rows, warnings };
}
