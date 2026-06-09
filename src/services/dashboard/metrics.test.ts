import { describe, it, expect } from 'vitest';
import {
  isOverdue,
  occupancyPercent,
  startOfMonthIso,
  startOfNextMonthIso,
} from './metrics';

describe('isOverdue', () => {
  it('Vergangenheit -> true', () => {
    expect(isOverdue('2026-05-31', '2026-06-01')).toBe(true);
  });
  it('Heute -> false (gleich, nicht ueberfaellig)', () => {
    expect(isOverdue('2026-06-01', '2026-06-01')).toBe(false);
  });
  it('Zukunft -> false', () => {
    expect(isOverdue('2026-06-15', '2026-06-01')).toBe(false);
  });
});

describe('startOfMonthIso', () => {
  it('mitten im Monat', () => {
    expect(startOfMonthIso('2026-06-15')).toBe('2026-06-01');
  });
  it('1. des Monats', () => {
    expect(startOfMonthIso('2026-06-01')).toBe('2026-06-01');
  });
  it('letzter Tag des Monats', () => {
    expect(startOfMonthIso('2026-06-30')).toBe('2026-06-01');
  });
});

describe('startOfNextMonthIso', () => {
  it('Juni -> Juli', () => {
    expect(startOfNextMonthIso('2026-06-15')).toBe('2026-07-01');
  });
  it('Dezember -> Januar Folgejahr', () => {
    expect(startOfNextMonthIso('2026-12-31')).toBe('2027-01-01');
  });
  it('Januar -> Februar', () => {
    expect(startOfNextMonthIso('2026-01-01')).toBe('2026-02-01');
  });
});

describe('occupancyPercent', () => {
  it('keine Wohnungen -> 0%', () => {
    expect(
      occupancyPercent(0, '2026-06-01', '2026-07-01', []),
    ).toBe(0);
  });

  it('leerer Monat (keine Buchungen) -> 0%', () => {
    expect(
      occupancyPercent(10, '2026-06-01', '2026-07-01', []),
    ).toBe(0);
  });

  it('100% wenn alle Wohnungen den ganzen Monat belegt', () => {
    // 10 Wohnungen, alle vom 1.6. bis 1.7. belegt
    const bookings = Array.from({ length: 10 }, () => ({
      start_date: '2026-06-01',
      end_date: '2026-07-01',
    }));
    expect(
      occupancyPercent(10, '2026-06-01', '2026-07-01', bookings),
    ).toBe(100);
  });

  it('50% wenn die Haelfte des Monats belegt', () => {
    // 1 Wohnung, halber Monat
    const bookings = [{ start_date: '2026-06-01', end_date: '2026-06-16' }];
    // 15 Tage von 30 Tagen = 50%
    expect(
      occupancyPercent(1, '2026-06-01', '2026-07-01', bookings),
    ).toBe(50);
  });

  it('Buchung ragt ueber Monatsende hinaus -> nur Range zaehlt', () => {
    const bookings = [{ start_date: '2026-06-20', end_date: '2026-08-01' }];
    // 1 Wohnung, 11 Tage in Juni-Range (20.6. bis 1.7. exklusiv) von 30 Tagen = 37%
    expect(
      occupancyPercent(1, '2026-06-01', '2026-07-01', bookings),
    ).toBe(37);
  });

  it('Buchung beginnt vor Range-Start -> nur Range zaehlt', () => {
    const bookings = [{ start_date: '2026-05-15', end_date: '2026-06-11' }];
    // 1 Wohnung, 10 Tage in Juni (1.6. bis 11.6.) von 30 Tagen = 33%
    expect(
      occupancyPercent(1, '2026-06-01', '2026-07-01', bookings),
    ).toBe(33);
  });

  it('Open-end-Buchung (9999-12-31) wird auf rangeTo gekappt', () => {
    const bookings = [{ start_date: '2026-06-01', end_date: '9999-12-31' }];
    expect(
      occupancyPercent(1, '2026-06-01', '2026-07-01', bookings),
    ).toBe(100);
  });

  it('mehrere Wohnungen + Mix', () => {
    // 5 Wohnungen, Juni hat 30 Tage = 150 apartment-days
    // Buchung A: 30 Tage (full month) = 30
    // Buchung B: 15 Tage = 15
    // Buchung C: 10 Tage = 10
    // = 55 occupied / 150 = 36.67% → 37
    const bookings = [
      { start_date: '2026-06-01', end_date: '2026-07-01' },
      { start_date: '2026-06-01', end_date: '2026-06-16' },
      { start_date: '2026-06-15', end_date: '2026-06-25' },
    ];
    expect(
      occupancyPercent(5, '2026-06-01', '2026-07-01', bookings),
    ).toBe(37);
  });

  it('Range mit Laenge 0 -> 0%', () => {
    expect(
      occupancyPercent(10, '2026-06-01', '2026-06-01', []),
    ).toBe(0);
  });
});
