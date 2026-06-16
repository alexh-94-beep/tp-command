import { describe, it, expect } from 'vitest';
import { decideRefreshCleaning } from './refresh';

describe('decideRefreshCleaning', () => {
  it('Einzug in Vergangenheit → null', () => {
    expect(decideRefreshCleaning('2026-06-01', '2026-06-10', '2026-06-16')).toBeNull();
  });

  it('Letzte Reinigung 3 Tage vor Einzug → null', () => {
    expect(decideRefreshCleaning('2026-06-15', '2026-06-18', '2026-06-15')).toBeNull();
  });

  it('Letzte Reinigung 8 Tage vor Einzug → pre_checkin', () => {
    const r = decideRefreshCleaning('2026-06-10', '2026-06-18', '2026-06-10');
    expect(r?.type).toBe('pre_checkin');
    expect(r?.daysBeforeMoveIn).toBe(1);
  });

  it('Letzte Reinigung 15 Tage vor Einzug → deep_clean', () => {
    const r = decideRefreshCleaning('2026-06-01', '2026-06-16', '2026-06-01');
    expect(r?.type).toBe('deep_clean');
    expect(r?.daysBeforeMoveIn).toBe(2);
  });

  it('Letzte Reinigung 22 Tage vor Einzug → deep_clean', () => {
    const r = decideRefreshCleaning('2026-05-25', '2026-06-16', '2026-06-01');
    expect(r?.type).toBe('deep_clean');
  });

  it('Keine vorherige Reinigung → pre_checkin (Vorsichtsmaßnahme)', () => {
    const r = decideRefreshCleaning(null, '2026-06-20', '2026-06-15');
    expect(r?.type).toBe('pre_checkin');
  });
});
