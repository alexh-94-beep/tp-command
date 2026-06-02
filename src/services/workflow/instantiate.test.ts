import { describe, it, expect } from 'vitest';
import { computeDueDate, evaluateConditionalStatus } from './instantiate';

describe('computeDueDate', () => {
  const dates = {
    start_date: '2026-06-01',
    end_date: '2026-09-30',
    created_iso: '2026-05-15',
  };

  it('anchor=check_in addiert offset auf start_date', () => {
    expect(computeDueDate('check_in', 0, dates)).toBe('2026-06-01');
    expect(computeDueDate('check_in', -7, dates)).toBe('2026-05-25');
    expect(computeDueDate('check_in', 3, dates)).toBe('2026-06-04');
  });

  it('anchor=check_out addiert offset auf end_date', () => {
    expect(computeDueDate('check_out', 0, dates)).toBe('2026-09-30');
    expect(computeDueDate('check_out', -14, dates)).toBe('2026-09-16');
    expect(computeDueDate('check_out', 30, dates)).toBe('2026-10-30');
  });

  it('anchor=created addiert offset auf created_iso', () => {
    expect(computeDueDate('created', 0, dates)).toBe('2026-05-15');
    expect(computeDueDate('created', 7, dates)).toBe('2026-05-22');
  });

  it('anchor=check_out liefert null bei unbefristeten Buchungen (9999-Sentinel)', () => {
    const openEnd = { ...dates, end_date: '9999-12-31' };
    expect(computeDueDate('check_out', -30, openEnd)).toBeNull();
    expect(computeDueDate('check_out', 0, openEnd)).toBeNull();
  });

  it('anchor=check_in funktioniert auch bei unbefristeten Buchungen', () => {
    const openEnd = { ...dates, end_date: '9999-12-31' };
    expect(computeDueDate('check_in', -7, openEnd)).toBe('2026-05-25');
  });
});

describe('evaluateConditionalStatus', () => {
  it('parking_included=false -> na', () => {
    expect(
      evaluateConditionalStatus('parking_included', { parking_included: false }),
    ).toBe('na');
  });

  it('parking_included=true -> open', () => {
    expect(
      evaluateConditionalStatus('parking_included', { parking_included: true }),
    ).toBe('open');
  });

  it('unbekannte Condition (z.B. damage_found) bleibt open', () => {
    expect(
      evaluateConditionalStatus('damage_found', { parking_included: false }),
    ).toBe('open');
  });

  it('condition_key=null -> open', () => {
    expect(evaluateConditionalStatus(null, { parking_included: false })).toBe('open');
  });
});
