import { describe, it, expect } from 'vitest';
import {
  mapApartmentNumber,
  mapAction,
  isWeekdayCell,
  toIsoDate,
  parseCityusSheet,
} from './cityus-parser';

describe('mapApartmentNumber', () => {
  it('3-stellig: D703 → D.0703', () => {
    expect(mapApartmentNumber('D703')).toBe('D.0703');
  });
  it('E903 → E.0903', () => {
    expect(mapApartmentNumber('E903')).toBe('E.0903');
  });
  it('D301 → D.0301', () => {
    expect(mapApartmentNumber('D301')).toBe('D.0301');
  });
  it('4-stellig: C1006 → C.1006', () => {
    expect(mapApartmentNumber('C1006')).toBe('C.1006');
  });
  it('Kleinbuchstaben: d703 → D.0703', () => {
    expect(mapApartmentNumber('d703')).toBe('D.0703');
  });
  it('Whitespace toleriert', () => {
    expect(mapApartmentNumber('  E204 ')).toBe('E.0204');
  });
  it('Nicht-CDE Buchstabe → null', () => {
    expect(mapApartmentNumber('A703')).toBeNull();
  });
  it('Mit Punkt → null (sollte Cityus-Format sein)', () => {
    expect(mapApartmentNumber('D.0703')).toBeNull();
  });
  it('Leer → null', () => {
    expect(mapApartmentNumber('')).toBeNull();
  });
});

describe('mapAction', () => {
  it('Final clean → checkout', () => {
    expect(mapAction('Final clean')).toEqual({
      type: 'checkout',
      linen_change: false,
    });
  });
  it('Weekly clean → weekly_clean ohne linen', () => {
    expect(mapAction('Weekly clean')).toEqual({
      type: 'weekly_clean',
      linen_change: false,
    });
  });
  it('Weekly clean & change of linen → weekly_clean_linen mit linen', () => {
    expect(mapAction('Weekly clean & change of linen')).toEqual({
      type: 'weekly_clean_linen',
      linen_change: true,
    });
  });
  it('Mehrfache Whitespaces toleriert', () => {
    expect(mapAction('Weekly  clean   &   change  of  linen')).toEqual({
      type: 'weekly_clean_linen',
      linen_change: true,
    });
  });
  it('Case-insensitive', () => {
    expect(mapAction('WEEKLY CLEAN')).toEqual({
      type: 'weekly_clean',
      linen_change: false,
    });
  });
  it('Final clean mit Zusatz (Montag …) → checkout', () => {
    expect(mapAction('Final clean (Montag 22.06.2026)')).toEqual({
      type: 'checkout',
      linen_change: false,
    });
  });
  it('Unbekannte Aktion → special', () => {
    expect(mapAction('Random Action')).toEqual({
      type: 'special',
      linen_change: false,
    });
  });
});

describe('isWeekdayCell', () => {
  it('Monday/Tuesday/... → true', () => {
    expect(isWeekdayCell('Monday')).toBe(true);
    expect(isWeekdayCell('tuesday')).toBe(true);
    expect(isWeekdayCell(' Sunday ')).toBe(true);
  });
  it('Anderes → false', () => {
    expect(isWeekdayCell('Mo')).toBe(false);
    expect(isWeekdayCell('')).toBe(false);
    expect(isWeekdayCell(null)).toBe(false);
    expect(isWeekdayCell(42)).toBe(false);
  });
});

describe('toIsoDate', () => {
  it('Date-Objekt (lokale Zeit, nicht UTC)', () => {
    expect(toIsoDate(new Date(2026, 5, 15, 0, 0, 0))).toBe('2026-06-15');
  });
  it('ISO-String', () => {
    expect(toIsoDate('2026-06-15')).toBe('2026-06-15');
    expect(toIsoDate('2026-06-15T00:00:00Z')).toBe('2026-06-15');
  });
  it('DD.MM.YYYY', () => {
    expect(toIsoDate('15.06.2026')).toBe('2026-06-15');
    expect(toIsoDate('5.6.2026')).toBe('2026-06-05');
  });
  it('Excel-Serial', () => {
    // 2026-06-15 entspricht Serial 46188 (Tage seit 1899-12-30)
    expect(toIsoDate(46188)).toBe('2026-06-15');
  });
  it('Null/undefined/Garbage → null', () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
    expect(toIsoDate('random')).toBeNull();
  });
});

describe('parseCityusSheet (integration mit Beispiel-Matrix)', () => {
  const matrix = [
    [null, 'ZURICH - Weekly Cleaning Planning'],
    [null, '15.06.2026 - 21.06.2026'],
    [null, 'Weekly cleaning & linen change'],
    [null, null],
    [null, 'ARRIVALS'],
    [null, 'Fr, 19.06.2026', 'D703', 'Junior', 'Yilin Wang', 'Arrival Check'],
    [null, null],
    [null, 'CHECK-OUTS'],
    [null, 'Sa, 13.06.2026', 'E903', 'Junior', 'Daniel', 'Final clean'],
    [null, null],
    [
      'Monday',
      new Date(Date.UTC(2026, 5, 15)),
      'E903',
      'Junior',
      'Daniel Denoon',
      'Final clean',
    ],
    [null, new Date(Date.UTC(2026, 5, 15)), null, null, null, null],
    [null, null],
    [
      'Tuesday',
      new Date(Date.UTC(2026, 5, 16)),
      'D301',
      'Senior',
      'Anita Flego',
      'Weekly clean & change of linen',
    ],
    [
      null,
      new Date(Date.UTC(2026, 5, 16)),
      'D302',
      'Senior',
      'Rolando Faria',
      'Weekly clean & change of linen',
    ],
    [
      null,
      new Date(Date.UTC(2026, 5, 16)),
      'E302',
      'Junior',
      'Dora Rizen',
      'Final clean',
    ],
  ];

  it('ignoriert oberen Teil, nimmt nur ab erstem Wochentag', () => {
    const { rows } = parseCityusSheet(matrix);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      date: '2026-06-15',
      cityusApartment: 'E903',
      apartmentNumber: 'E.0903',
      guestName: 'Daniel Denoon',
      rawAction: 'Final clean',
      type: 'checkout',
      linen_change: false,
    });
  });

  it('mapped Weekly clean & change of linen korrekt', () => {
    const { rows } = parseCityusSheet(matrix);
    const tuesday = rows.find((r) => r.cityusApartment === 'D301');
    expect(tuesday?.type).toBe('weekly_clean_linen');
    expect(tuesday?.linen_change).toBe(true);
  });

  it('uebernimmt Datum aus Spalte 1 wenn vorhanden', () => {
    const { rows } = parseCityusSheet(matrix);
    expect(rows.find((r) => r.cityusApartment === 'D302')?.date).toBe('2026-06-16');
  });

  it('warnt bei unbekanntem Apartment-Pattern', () => {
    const m = [
      ['Monday', new Date(Date.UTC(2026, 5, 15)), 'XYZ', 'foo', 'guest', 'Final clean'],
    ];
    const { rows, warnings } = parseCityusSheet(m);
    expect(rows).toHaveLength(0);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('XYZ');
  });

  it('leeres Excel → kein Crash, Warnung', () => {
    const { rows, warnings } = parseCityusSheet([]);
    expect(rows).toHaveLength(0);
    expect(warnings).toContain('Kein Wochentag-Block gefunden im Excel.');
  });
});
