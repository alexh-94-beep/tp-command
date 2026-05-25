import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseApartmentsXlsx } from './apartments';

/**
 * Tests fuer den XLSX-Parser der Wohnungs-Importliste.
 *
 * Wir bauen die Test-Workbooks synthetisch zur Laufzeit (kein Fixture-File),
 * damit Strukturwechsel im Sheet sichtbar im Test-Code dokumentiert sind.
 */

const HEADERS = [
  'Wohnung',
  'Typ',
  'Etage',
  'Fläche',
  'Ausrichtung',
  'Bruttomiete',
  'Status',
  'Mieter',
  'Einzug',
  'Auszug',
  'Status Einrichtung',
  'Verkauf',
  'Signatur bestellt?',
] as const;

type Cell = string | number | Date | null;

interface RowInput {
  number?: Cell;
  type?: Cell;
  floor?: Cell;
  size?: Cell;
  orientation?: Cell;
  rent?: Cell;
  status?: Cell;
  tenant?: Cell;
  moveIn?: Cell;
  moveOut?: Cell;
  furnishing?: Cell;
  sale?: Cell;
  nameTag?: Cell;
}

function row(r: RowInput): Cell[] {
  return [
    r.number ?? null,
    r.type ?? null,
    r.floor ?? null,
    r.size ?? null,
    r.orientation ?? null,
    r.rent ?? null,
    r.status ?? null,
    r.tenant ?? null,
    r.moveIn ?? null,
    r.moveOut ?? null,
    r.furnishing ?? null,
    r.sale ?? null,
    r.nameTag ?? null,
  ];
}

function buildXlsx(
  dataRows: Cell[][],
  opts: { sheetName?: string; headers?: readonly string[] | null } = {},
): Buffer {
  const headers = opts.headers === null ? null : (opts.headers ?? HEADERS);
  const aoa: Cell[][] = [
    ['Mietzinsspiegel (Titel-Zeile, wird ignoriert)'],
    ...(headers ? [headers as Cell[]] : []),
    ...dataRows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName ?? 'Overview Apartments (2)');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

// ── Happy Path ─────────────────────────────────────────────────────────

describe('parseApartmentsXlsx — Happy Path', () => {
  it('parsed eine minimale Zeile mit allen Standardwerten', () => {
    const buf = buildXlsx([
      row({
        number: 'C.0201',
        type: 'Senior',
        floor: 2,
        size: 70.0,
        orientation: 'Nord/Ost',
        rent: 3086,
        status: 'vermietet',
        tenant: 'Anna Müller',
        furnishing: 1,
        nameTag: 'ja',
      }),
    ]);

    const { rows, warnings } = parseApartmentsXlsx(buf);

    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      number: 'C.0201',
      building: 'C',
      type: 'senior',
      floor: 2,
      size_sqm: 70,
      orientation: 'Nord/Ost',
      standard_rent: 3086,
      status: 'occupied',
      ownership: 'own',
      furnishing_completion: 1,
      name_tag_status: 'installed',
      current_tenant_text: 'Anna Müller',
      allowed_rental_types: ['long_term'],
    });
  });

  it('extrahiert Gebäude aus der Wohnungsnummer (C/D/E)', () => {
    const buf = buildXlsx([
      row({ number: 'C.0101', type: 'Senior', rent: 1, status: 'vermietet' }),
      row({ number: 'D.0203', type: 'Junior', rent: 1, status: 'vermietet' }),
      row({ number: 'E.0801', type: 'Senior', rent: 1, status: 'vermietet' }),
    ]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows.map((r) => r.building)).toEqual(['C', 'D', 'E']);
  });
});

// ── Status- und Ownership-Mapping ─────────────────────────────────────

describe('parseApartmentsXlsx — Status & Ownership', () => {
  it.each([
    ['vermietet', 'occupied', 'own'],
    ['verfügbar', 'available', 'own'],
    ['verfuegbar', 'available', 'own'],
    ['frei', 'available', 'own'],
    ['gekündigt', 'terminated', 'own'],
    ['gekuendigt', 'terminated', 'own'],
    ['Vertrag erstellt', 'contract_pending', 'own'],
    ['reserviert', 'contract_pending', 'own'],
    ['verkauft', 'available', 'sold_external'],
    ['etwas-unbekanntes', 'available', 'own'],
  ])('mapping: status "%s" -> status=%s, ownership=%s', (input, expStatus, expOwn) => {
    const buf = buildXlsx([
      row({ number: 'C.0101', type: 'Senior', rent: 1, status: input, tenant: 'X' }),
    ]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows[0].status).toBe(expStatus);
    expect(rows[0].ownership).toBe(expOwn);
  });

  it('spezial + Booking-Mieter -> available + nur booking erlaubt', () => {
    const buf = buildXlsx([
      row({
        number: 'C.0101',
        type: 'Senior',
        rent: 1,
        status: 'spezial',
        tenant: 'Booking-Pool',
      }),
    ]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows[0].status).toBe('available');
    expect(rows[0].allowed_rental_types).toEqual(['booking']);
  });

  it('spezial ohne Mieter -> available + booking erlaubt (Pool-Default)', () => {
    const buf = buildXlsx([
      row({ number: 'C.0101', type: 'Senior', rent: 1, status: 'spezial' }),
    ]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows[0].status).toBe('available');
    expect(rows[0].allowed_rental_types).toEqual(['booking']);
  });

  it('spezial + Nicht-Booking-Mieter -> blocked + keine Vermietung', () => {
    const buf = buildXlsx([
      row({
        number: 'C.0101',
        type: 'Senior',
        rent: 1,
        status: 'spezial',
        tenant: 'Besprechungsraum',
      }),
    ]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows[0].status).toBe('blocked');
    expect(rows[0].allowed_rental_types).toEqual([]);
  });
});

// ── Typ- und name_tag-Mapping ─────────────────────────────────────────

describe('parseApartmentsXlsx — Typ & Türschild', () => {
  it.each([
    ['Junior', 'junior'],
    ['SENIOR', 'senior'],
    ['suite', 'suite'],
    ['Studio', 'studio'],
  ])('Typ "%s" wird zu %s normalisiert', (input, expected) => {
    const buf = buildXlsx([row({ number: 'C.0101', type: input, rent: 1, status: 'vermietet' })]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows[0].type).toBe(expected);
  });

  it('unbekannter Typ -> Warnung + Zeile übersprungen', () => {
    const buf = buildXlsx([
      row({ number: 'C.0101', type: 'Penthouse', rent: 1, status: 'vermietet' }),
    ]);
    const { rows, warnings } = parseApartmentsXlsx(buf);
    expect(rows).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ field: 'type' });
  });

  it.each([
    ['ja', 'installed'],
    ['Ja', 'installed'],
    ['bestellt', 'ordered'],
    ['in Arbeit', 'ordered'],
    ['', 'pending'],
    ['nein', 'pending'],
  ])('Türschild "%s" -> %s', (input, expected) => {
    const buf = buildXlsx([
      row({ number: 'C.0101', type: 'Senior', rent: 1, status: 'vermietet', nameTag: input }),
    ]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows[0].name_tag_status).toBe(expected);
  });
});

// ── Datums- und Furnishing-Parsing ────────────────────────────────────

describe('parseApartmentsXlsx — Datum & Möblierung', () => {
  it('akzeptiert ISO YYYY-MM-DD, deutsches DD.MM.YYYY und Date-Objekte', () => {
    const buf = buildXlsx([
      row({
        number: 'C.0101',
        type: 'Senior',
        rent: 1,
        status: 'vermietet',
        moveIn: '2026-04-01',
        moveOut: '15.06.2026',
      }),
      row({
        number: 'C.0102',
        type: 'Senior',
        rent: 1,
        status: 'vermietet',
        moveIn: new Date(2026, 0, 31), // 31. Januar 2026 lokal
      }),
    ]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows[0].current_move_in).toBe('2026-04-01');
    expect(rows[0].current_move_out).toBe('2026-06-15');
    expect(rows[1].current_move_in).toBe('2026-01-31');
  });

  it.each([
    [1, 1],
    [0.5, 0.5],
    [50, 0.5], // Werte >1 werden als Prozent interpretiert -> /100
    [100, 1],
    [null, 1], // Default fuer leere Zelle
    [1.2, 0.012], // 1.2 ist >1 -> als Prozent gedeutet, also 0.012 (Excel-Quirk dokumentiert)
  ])('Möblierung-Wert %s -> furnishing_completion %s', (input, expected) => {
    const buf = buildXlsx([
      row({
        number: 'C.0101',
        type: 'Senior',
        rent: 1,
        status: 'vermietet',
        furnishing: input,
      }),
    ]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows[0].furnishing_completion).toBeCloseTo(expected, 4);
  });
});

// ── Numerik mit deutschen Formaten ─────────────────────────────────────

describe('parseApartmentsXlsx — Zahlenformate', () => {
  it('akzeptiert Komma als Dezimaltrenner', () => {
    const buf = buildXlsx([
      row({ number: 'C.0101', type: 'Senior', rent: 1, status: 'vermietet', size: '70,5' }),
    ]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows[0].size_sqm).toBe(70.5);
  });

  it('fehlende Bruttomiete -> standard_rent=0', () => {
    const buf = buildXlsx([
      row({ number: 'C.0101', type: 'Senior', rent: null, status: 'vermietet' }),
    ]);
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows[0].standard_rent).toBe(0);
  });
});

// ── Duplikate, Leerzeilen, fehlende Header ─────────────────────────────

describe('parseApartmentsXlsx — Robustheit', () => {
  it('doppelte Wohnungsnummer -> Warnung + nur die erste übernommen', () => {
    const buf = buildXlsx([
      row({ number: 'C.0101', type: 'Senior', rent: 1, status: 'vermietet' }),
      row({ number: 'C.0101', type: 'Senior', rent: 1, status: 'verfügbar' }),
    ]);
    const { rows, warnings } = parseApartmentsXlsx(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('occupied'); // die erste
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ field: 'number' });
  });

  it('Zeilen ohne Wohnungsnummer werden uebersprungen', () => {
    const buf = buildXlsx([
      row({ type: 'Senior', rent: 1, status: 'vermietet' }), // ohne number -> Leerzeile
      row({ number: 'C.0101', type: 'Senior', rent: 1, status: 'vermietet' }),
    ]);
    const { rows, warnings } = parseApartmentsXlsx(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].number).toBe('C.0101');
    expect(warnings).toEqual([]);
  });

  it('Sheet ohne Spalte "Wohnung" -> Exception', () => {
    const customHeaders = [...HEADERS].map((h) => (h === 'Wohnung' ? 'Foo' : h));
    const buf = buildXlsx(
      [row({ number: 'C.0101', type: 'Senior', rent: 1, status: 'vermietet' })],
      { headers: customHeaders },
    );
    expect(() => parseApartmentsXlsx(buf)).toThrow(/Wohnung/);
  });

  it('Sheet ohne Spalte "Typ" -> Exception', () => {
    const customHeaders = [...HEADERS].map((h) => (h === 'Typ' ? 'Foo' : h));
    const buf = buildXlsx(
      [row({ number: 'C.0101', type: 'Senior', rent: 1, status: 'vermietet' })],
      { headers: customHeaders },
    );
    expect(() => parseApartmentsXlsx(buf)).toThrow(/Typ/);
  });

  it('leere Datei -> Exception "keine Daten"', () => {
    const buf = buildXlsx([], { headers: null });
    expect(() => parseApartmentsXlsx(buf)).toThrow(/keine Daten/i);
  });

  it('Fallback auf erstes Sheet, wenn "Overview Apartments" fehlt', () => {
    const buf = buildXlsx(
      [row({ number: 'C.0101', type: 'Senior', rent: 1, status: 'vermietet' })],
      { sheetName: 'Andere Übersicht' },
    );
    const { rows } = parseApartmentsXlsx(buf);
    expect(rows).toHaveLength(1);
  });
});
