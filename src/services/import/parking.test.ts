import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  parseGermanDate,
  parseMietverhaeltnis,
  parseParkingSpiegelXlsx,
  splitTenantLabel,
} from './parking';

describe('parseGermanDate', () => {
  it('konvertiert DD.MM.YYYY zu ISO', () => {
    expect(parseGermanDate('01.05.2024')).toBe('2024-05-01');
    expect(parseGermanDate('17.06.2026')).toBe('2026-06-17');
    expect(parseGermanDate('5.6.2026')).toBe('2026-06-05');
  });
  it('gibt null bei offen / leer / falsch', () => {
    expect(parseGermanDate('offen')).toBeNull();
    expect(parseGermanDate('')).toBeNull();
    expect(parseGermanDate(null)).toBeNull();
    expect(parseGermanDate('2026-01-01')).toBeNull();
    expect(parseGermanDate(undefined)).toBeNull();
  });
});

describe('parseMietverhaeltnis', () => {
  it('parst "DD.MM.YYYY - DD.MM.YYYY"', () => {
    expect(parseMietverhaeltnis('01.05.2024 - 31.12.2026')).toEqual({
      startDate: '2024-05-01',
      endDate: '2026-12-31',
    });
  });
  it('parst "DD.MM.YYYY - offen"', () => {
    expect(parseMietverhaeltnis('01.05.2024 - offen')).toEqual({
      startDate: '2024-05-01',
      endDate: null,
    });
  });
  it('null bei kaputtem Format', () => {
    expect(parseMietverhaeltnis('unklar')).toEqual({
      startDate: null,
      endDate: null,
    });
  });
});

describe('parseParkingSpiegelXlsx — echtes W&W-Sample', () => {
  const buf = readFileSync(
    join(__dirname, '__fixtures__', 'parking-spiegel-sample.xls'),
  );
  const r = parseParkingSpiegelXlsx(buf);

  it('liest alle 91 Einstellplaetze ein', () => {
    expect(r.rows.length).toBe(91);
    expect(r.errors).toEqual([]);
  });
  it('erkennt Luecken im Range', () => {
    expect(r.gaps).toEqual([69, 70, 113, 127, 142, 148]);
  });
  it('keine Duplikate', () => {
    expect(r.duplicates).toEqual([]);
  });
  it('erkennt Exportdatum', () => {
    expect(r.exportDate).toBe('2026-06-17');
  });
  it('parst erste Zeile korrekt', () => {
    const first = r.rows.find((x) => x.number === 65)!;
    expect(first.tenantLabel).toBe('Szczepan Kras');
    expect(first.externalRef).toBe('10012');
    expect(first.startDate).toBe('2024-05-01');
    expect(first.endDate).toBeNull();
    expect(first.monthlyRent).toBe(150);
    expect(first.buildingLabel).toContain('Sonnentalstrasse');
  });
  it('TPB-Slots haben monthlyRent=null (0 → null)', () => {
    const tpb = r.rows.find((x) => x.number === 64)!;
    expect(tpb.tenantLabel).toContain('THREE POINT');
    expect(tpb.externalRef).toBe('10000');
    expect(tpb.monthlyRent).toBeNull();
  });
});

describe('splitTenantLabel', () => {
  it('trennt Kundennummer + Name', () => {
    expect(splitTenantLabel('10012 Szczepan Kras')).toEqual({
      externalRef: '10012',
      tenantLabel: 'Szczepan Kras',
    });
    expect(splitTenantLabel('10190 Neuropsychiatricum (Kunde Fabrik 11)')).toEqual({
      externalRef: '10190',
      tenantLabel: 'Neuropsychiatricum (Kunde Fabrik 11)',
    });
  });
  it('akzeptiert auch ohne Nr', () => {
    expect(splitTenantLabel('Leerstand')).toEqual({
      externalRef: null,
      tenantLabel: 'Leerstand',
    });
  });
  it('null bei leer', () => {
    expect(splitTenantLabel('')).toEqual({
      externalRef: null,
      tenantLabel: null,
    });
    expect(splitTenantLabel(null)).toEqual({
      externalRef: null,
      tenantLabel: null,
    });
  });
});
