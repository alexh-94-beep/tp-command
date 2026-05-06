/**
 * Excel-Import für Wohnungen aus dem Sheet "Overview Apartments (2)" der
 * bestehenden Mietzinsspiegel-Liste.
 *
 * Diese Logik ist UI-frei und wird vom Server Action getestet aufgerufen.
 */
import * as XLSX from 'xlsx';
import type {
  ApartmentOwnership,
  ApartmentStatus,
  ApartmentType,
  NameTagStatus,
} from '@/types/db';

export interface ParsedApartmentRow {
  rowNumber: number;
  number: string;
  building: string;
  type: ApartmentType;
  size_sqm: number | null;
  floor: number | null;
  orientation: string | null;
  standard_rent: number;
  status: ApartmentStatus;
  ownership: ApartmentOwnership;
  furnishing_completion: number;
  name_tag_status: NameTagStatus;
  notes: string | null;
  /** Spalte „Mieter" – wird in Phase 1.2 für Tenant-Anlegen genutzt */
  current_tenant_text: string | null;
  /** Spalte „Einzug" – wird in Phase 1.2 für Buchungen genutzt */
  current_move_in: string | null;
  /** Spalte „Auszug" */
  current_move_out: string | null;
  allowed_rental_types: Array<'long_term' | 'short_term' | 'booking'>;
}

export interface ImportPreview {
  rows: ParsedApartmentRow[];
  warnings: ImportWarning[];
}

export interface ImportWarning {
  rowNumber: number;
  field: string;
  message: string;
}

const DEFAULT_SHEET = 'Overview Apartments (2)';

/** Whitelist: erwartete Spalten-Header in Reihenfolge */
const HEADER = {
  number: 'Wohnung',
  type: 'Typ',
  floor: 'Etage',
  size: 'Fläche',
  orientation: 'Ausrichtung',
  rent: 'Bruttomiete',
  status: 'Status',
  tenant: 'Mieter',
  moveIn: 'Einzug',
  moveOut: 'Auszug',
  furnishing: 'Status Einrichtung',
  sale: 'Verkauf',
  nameTag: 'Signatur bestellt?',
} as const;

/* ------------------------------------------------------------------ *
 *  Mapping-Helfer – Excel-Werte → unsere Enums                        *
 * ------------------------------------------------------------------ */

function mapType(raw: unknown): ApartmentType | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'junior') return 'junior';
  if (v === 'senior') return 'senior';
  if (v === 'suite') return 'suite';
  if (v === 'studio') return 'studio';
  return null;
}

function isBookingTenantText(rawTenant: unknown): boolean {
  const t = String(rawTenant ?? '').trim().toLowerCase();
  if (!t) return false;
  return t.includes('booking');
}

function mapStatus(rawStatus: unknown, rawTenant: unknown): ApartmentStatus {
  const v = String(rawStatus ?? '').trim().toLowerCase();
  switch (v) {
    case 'vermietet':         return 'occupied';
    case 'verfügbar':
    case 'verfuegbar':
    case 'verfugbar':
    case 'frei':              return 'available';
    case 'gekündigt':
    case 'gekuendigt':        return 'terminated';
    case 'vertrag erstellt':  return 'contract_pending';
    case 'spezial':
      // Spezial + Mieter "Booking…" = Pool-Wohnung (frei für Booking-Reservationen)
      // Spezial + anderer Mieter = anders blockiert (Verkaufswohnung, Besprechungsraum, …)
      return isBookingTenantText(rawTenant) || !rawTenant ? 'available' : 'blocked';
    case 'reserviert':        return 'contract_pending';
    case 'verkauft':          return 'available';
    default:                  return 'available';
  }
}

/**
 * Erlaubte Vermietungsarten ableiten.
 *  - "spezial" + Mieter "Booking…" → Pool-Wohnung (nur Booking)
 *  - "spezial" + anderer Mieter → keine Vermietung (blockiert, kein Pool)
 *  - sonst Default langzeitfähig
 */
function inferAllowedRentalTypes(
  rawStatus: unknown,
  rawTenant: unknown,
): Array<'long_term' | 'short_term' | 'booking'> {
  const v = String(rawStatus ?? '').trim().toLowerCase();
  if (v === 'spezial') {
    return isBookingTenantText(rawTenant) || !rawTenant ? ['booking'] : [];
  }
  return ['long_term'];
}

function mapOwnership(rawStatus: unknown, _rawSale: unknown): ApartmentOwnership {
  // Wir verlassen uns ausschliesslich auf die Status-Spalte. Die Excel-Spalte
  // "Verkauf" ist nicht konsistent gepflegt (z. B. C.0802 ist vermietet, hat
  // aber "Verkauf" stehen), deshalb ignorieren wir sie.
  // Office stellt die Ausnahmen (sold_managed) manuell um.
  const status = String(rawStatus ?? '').trim().toLowerCase();
  if (status === 'verkauft') return 'sold_external';
  return 'own';
}

function mapNameTag(raw: unknown): NameTagStatus {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'ja') return 'installed';
  if (v === 'bestellt' || v === 'in arbeit') return 'ordered';
  return 'pending';
}

function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseFloor(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  if (raw instanceof Date) {
    return formatDateAsIso(raw);
  }
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
  }
  const s = String(raw).trim();
  // ISO YYYY-MM-DD[*]
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Deutsch DD.MM.YYYY oder DD.MM.YY
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (de) {
    const [, dd, mm, yy] = de;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // Schweiz/Deutsch DD/MM/YYYY (wir gehen davon aus DD/MM, nicht US-MM/DD)
  const sl = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (sl) {
    const [, dd, mm, yy] = sl;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // Fallback: Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return formatDateAsIso(new Date(t));
  return null;
}

function formatDateAsIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseFurnishing(raw: unknown): number {
  // Excel: 1, 0.8875, 0.9375 → wir speichern 0.000–1.000
  const n = parseNumber(raw);
  if (n === null) return 1;
  if (n <= 1) return Math.max(0, Math.min(1, n));
  if (n <= 100) return n / 100;
  return 1;
}

function buildingFromNumber(number: string): string {
  const m = number.match(/^([A-Z])\./);
  return m ? m[1] : '';
}

/* ------------------------------------------------------------------ *
 *  Hauptfunktion                                                       *
 * ------------------------------------------------------------------ */

export function parseApartmentsXlsx(buffer: ArrayBuffer | Buffer): ImportPreview {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes('overview apartments')) ??
    wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Sheet "${DEFAULT_SHEET}" nicht gefunden.`);
  }

  // Als Array-of-Arrays lesen (Header in Zeile 2).
  // raw: true + cellDates: true → Datums-Zellen kommen als JS-Date.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });

  if (aoa.length < 3) {
    throw new Error('Datei enthält keine Daten.');
  }

  const headerRow = aoa[1] as string[];
  const colIdx = (label: string) =>
    headerRow.findIndex((h) => String(h ?? '').trim() === label);

  const idx = {
    number:     colIdx(HEADER.number),
    type:       colIdx(HEADER.type),
    floor:      colIdx(HEADER.floor),
    size:       colIdx(HEADER.size),
    orientation:colIdx(HEADER.orientation),
    rent:       colIdx(HEADER.rent),
    status:     colIdx(HEADER.status),
    tenant:     colIdx(HEADER.tenant),
    moveIn:     colIdx(HEADER.moveIn),
    moveOut:    colIdx(HEADER.moveOut),
    furnishing: colIdx(HEADER.furnishing),
    sale:       colIdx(HEADER.sale),
    nameTag:    colIdx(HEADER.nameTag),
  };

  if (idx.number < 0) throw new Error('Spalte "Wohnung" fehlt.');
  if (idx.type   < 0) throw new Error('Spalte "Typ" fehlt.');

  const warnings: ImportWarning[] = [];
  const rows: ParsedApartmentRow[] = [];
  const seenNumbers = new Set<string>();

  for (let i = 2; i < aoa.length; i++) {
    const r = aoa[i] as unknown[];
    const rowNumber = i + 1; // 1-basiert + Header

    const numberRaw = r[idx.number];
    if (!numberRaw) continue; // Leerzeile

    const number = String(numberRaw).trim();
    if (seenNumbers.has(number)) {
      warnings.push({
        rowNumber, field: 'number',
        message: `Wohnungsnummer "${number}" doppelt im Sheet.`,
      });
      continue;
    }
    seenNumbers.add(number);

    const type = mapType(r[idx.type]);
    if (!type) {
      warnings.push({
        rowNumber, field: 'type',
        message: `Unbekannter Typ "${r[idx.type]}" – wird übersprungen.`,
      });
      continue;
    }

    const standardRent = parseNumber(r[idx.rent]) ?? 0;
    const sizeSqm      = parseNumber(r[idx.size]);
    const floor        = parseFloor(r[idx.floor]);
    const orientation  = r[idx.orientation] ? String(r[idx.orientation]).trim() : null;
    const status       = mapStatus(r[idx.status], r[idx.tenant]);
    const ownership    = mapOwnership(r[idx.status], r[idx.sale]);
    const furnishing   = parseFurnishing(r[idx.furnishing]);
    const nameTag      = mapNameTag(idx.nameTag >= 0 ? r[idx.nameTag] : null);
    const tenantText   = r[idx.tenant] ? String(r[idx.tenant]).trim() : null;
    const moveIn       = idx.moveIn  >= 0 ? parseDate(r[idx.moveIn])  : null;
    const moveOut      = idx.moveOut >= 0 ? parseDate(r[idx.moveOut]) : null;

    rows.push({
      rowNumber,
      number,
      building: buildingFromNumber(number),
      type,
      size_sqm: sizeSqm,
      floor,
      orientation,
      standard_rent: standardRent,
      status,
      ownership,
      furnishing_completion: furnishing,
      name_tag_status: nameTag,
      notes: null,
      current_tenant_text: tenantText,
      current_move_in: moveIn,
      current_move_out: moveOut,
      allowed_rental_types: inferAllowedRentalTypes(r[idx.status], r[idx.tenant]),
    });
  }

  return { rows, warnings };
}
