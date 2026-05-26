import { describe, it, expect } from 'vitest';
import { validateAvailabilityRange } from './check';

describe('validateAvailabilityRange', () => {
  it('akzeptiert einen normalen Zeitraum', () => {
    expect(validateAvailabilityRange('2026-06-01', '2026-06-10')).toEqual({ valid: true });
  });

  it('lehnt Auszug == Einzug ab (Auszug ist exklusiv)', () => {
    const r = validateAvailabilityRange('2026-06-01', '2026-06-01');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/Auszug.*nach.*Einzug/);
  });

  it('lehnt Auszug vor Einzug ab', () => {
    const r = validateAvailabilityRange('2026-06-10', '2026-06-01');
    expect(r.valid).toBe(false);
  });

  it('akzeptiert open-end Sentinel 9999-12-31', () => {
    expect(validateAvailabilityRange('2026-06-01', '9999-12-31').valid).toBe(true);
  });
});
