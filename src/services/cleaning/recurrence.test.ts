import { describe, it, expect } from 'vitest';
import {
  shiftFromWeekend,
  defaultRecurrenceHorizon,
  computeRecurrenceDates,
  recurrenceCleaningType,
} from './recurrence';

describe('shiftFromWeekend', () => {
  // 2026-06-19 = Freitag, 20 = Samstag, 21 = Sonntag, 22 = Montag
  it('Samstag → Freitag', () => {
    expect(shiftFromWeekend('2026-06-20')).toBe('2026-06-19');
  });
  it('Sonntag → Montag', () => {
    expect(shiftFromWeekend('2026-06-21')).toBe('2026-06-22');
  });
  it('Mo-Fr unveraendert', () => {
    expect(shiftFromWeekend('2026-06-19')).toBe('2026-06-19');
    expect(shiftFromWeekend('2026-06-22')).toBe('2026-06-22');
    expect(shiftFromWeekend('2026-06-17')).toBe('2026-06-17');
  });
});

describe('defaultRecurrenceHorizon', () => {
  it('addiert 3 Monate', () => {
    expect(defaultRecurrenceHorizon('2026-06-19')).toBe('2026-09-19');
    expect(defaultRecurrenceHorizon('2026-12-15')).toBe('2027-03-15');
  });
});

describe('computeRecurrenceDates', () => {
  it('none → leere Liste', () => {
    const r = computeRecurrenceDates({
      startDate: '2026-06-01',
      endDate: '2026-12-31',
      recurrence: 'none',
      horizonDate: '2026-09-01',
    });
    expect(r).toEqual([]);
  });

  it('weekly mit Auszug nach 3 Wochen → 3 Termine', () => {
    const r = computeRecurrenceDates({
      startDate: '2026-06-01', // Montag
      endDate: '2026-06-25',
      recurrence: 'weekly',
      horizonDate: '2027-01-01',
      shiftWeekend: false,
    });
    expect(r).toEqual(['2026-06-08', '2026-06-15', '2026-06-22']);
  });

  it('weekly mit Weekend-Shift → Sa→Fr', () => {
    // 2026-06-13 = Samstag, sollte zu Freitag 12 werden
    const r = computeRecurrenceDates({
      startDate: '2026-06-06', // Samstag
      endDate: '2026-06-25',
      recurrence: 'weekly',
      horizonDate: '2027-01-01',
    });
    // 06.06 (Sa) → erster Termin 13.06 Sa → 12.06 Fr
    //              dann 20.06 Sa → 19.06 Fr
    //              dann 27.06 Sa nach Auszug raus
    expect(r).toContain('2026-06-12');
    expect(r).toContain('2026-06-19');
    expect(r.length).toBe(2);
  });

  it('biweekly → 14 Tage Schritte', () => {
    const r = computeRecurrenceDates({
      startDate: '2026-06-01', // Mo
      endDate: '2026-08-01',
      recurrence: 'biweekly',
      horizonDate: '2027-01-01',
      shiftWeekend: false,
    });
    expect(r).toEqual(['2026-06-15', '2026-06-29', '2026-07-13', '2026-07-27']);
  });

  it('monthly → 1 Monat Schritte', () => {
    const r = computeRecurrenceDates({
      startDate: '2026-06-01',
      endDate: '2026-11-30',
      recurrence: 'monthly',
      horizonDate: '2027-01-01',
      shiftWeekend: false,
    });
    expect(r).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
    ]);
  });

  it('open-ended → horizon greift', () => {
    const r = computeRecurrenceDates({
      startDate: '2026-06-01',
      endDate: '9999-12-31',
      recurrence: 'weekly',
      horizonDate: '2026-07-15',
      shiftWeekend: false,
    });
    // Termine: 08, 15, 22, 29 Juni; 06, 13 Juli (15 inkl.)
    expect(r.length).toBe(6);
    expect(r[r.length - 1]).toBe('2026-07-13');
  });

  it('horizon vor erstem Termin → leer', () => {
    const r = computeRecurrenceDates({
      startDate: '2026-06-01',
      endDate: '9999-12-31',
      recurrence: 'weekly',
      horizonDate: '2026-06-05',
    });
    expect(r).toEqual([]);
  });
});

describe('recurrenceCleaningType', () => {
  it('weekly ohne linen', () => {
    expect(recurrenceCleaningType('weekly', false)).toBe('weekly_clean');
  });
  it('weekly mit linen', () => {
    expect(recurrenceCleaningType('weekly', true)).toBe('weekly_clean_linen');
  });
  it('biweekly mit linen', () => {
    expect(recurrenceCleaningType('biweekly', true)).toBe('biweekly_clean_linen');
  });
  it('monthly ohne linen', () => {
    expect(recurrenceCleaningType('monthly', false)).toBe('monthly_clean');
  });
  it('none → null', () => {
    expect(recurrenceCleaningType('none', false)).toBeNull();
  });
});
