import { describe, it, expect } from 'vitest';
import {
  compareSuggestions,
  hasSufficientCleaningBuffer,
  type ApartmentSuggestion,
} from './auto-assign';

describe('hasSufficientCleaningBuffer', () => {
  it('null gap (kein Nachbar) -> immer ok', () => {
    expect(hasSufficientCleaningBuffer(null, 0)).toBe(true);
    expect(hasSufficientCleaningBuffer(null, 24)).toBe(true);
  });

  it('gap >= 1 Tag -> immer ok', () => {
    expect(hasSufficientCleaningBuffer(1, 8)).toBe(true);
    expect(hasSufficientCleaningBuffer(7, 24)).toBe(true);
  });

  it('Same-Day-Turnover ok wenn buffer <= 3 h', () => {
    expect(hasSufficientCleaningBuffer(0, 0)).toBe(true);
    expect(hasSufficientCleaningBuffer(0, 3)).toBe(true);
  });

  it('Same-Day-Turnover NICHT ok wenn buffer > 3 h', () => {
    expect(hasSufficientCleaningBuffer(0, 4)).toBe(false);
    expect(hasSufficientCleaningBuffer(0, 6)).toBe(false);
    expect(hasSufficientCleaningBuffer(0, 24)).toBe(false);
  });

  it('Negativer Gap (Ueberlappung) -> immer false', () => {
    expect(hasSufficientCleaningBuffer(-1, 0)).toBe(false);
  });
});

function s(overrides: Partial<ApartmentSuggestion>): ApartmentSuggestion {
  return {
    apartment_id: 'x',
    number: 'C.0101',
    building: 'C',
    type: 'senior',
    is_pool_default: false,
    booking_priority: 50,
    cleaning_buffer_hours: 4,
    gap_before_days: null,
    gap_after_days: null,
    total_gap: 999,
    available: true,
    ...overrides,
  };
}

describe('compareSuggestions', () => {
  it('verfuegbar vor nicht-verfuegbar', () => {
    const items = [s({ available: false, number: 'A' }), s({ available: true, number: 'B' })];
    items.sort(compareSuggestions);
    expect(items[0].number).toBe('B');
  });

  it('pool_default vor regular', () => {
    const items = [
      s({ is_pool_default: false, number: 'A' }),
      s({ is_pool_default: true, number: 'B' }),
    ];
    items.sort(compareSuggestions);
    expect(items[0].number).toBe('B');
  });

  it('hoehere booking_priority zuerst', () => {
    const items = [
      s({ booking_priority: 30, number: 'A' }),
      s({ booking_priority: 80, number: 'B' }),
      s({ booking_priority: 50, number: 'C' }),
    ];
    items.sort(compareSuggestions);
    expect(items.map((i) => i.number)).toEqual(['B', 'C', 'A']);
  });

  it('Tetris: kleinerer total_gap zuerst bei gleicher Prio', () => {
    const items = [
      s({ booking_priority: 50, total_gap: 5, number: 'A' }),
      s({ booking_priority: 50, total_gap: 2, number: 'B' }),
    ];
    items.sort(compareSuggestions);
    expect(items[0].number).toBe('B');
  });

  it('Reihenfolge: available > pool_default > prio > gap', () => {
    const items = [
      s({ available: false, is_pool_default: true, booking_priority: 100, number: 'unavail' }),
      s({ is_pool_default: false, booking_priority: 99, total_gap: 0, number: 'high-prio' }),
      s({ is_pool_default: true, booking_priority: 1, total_gap: 999, number: 'pool-default' }),
    ];
    items.sort(compareSuggestions);
    expect(items.map((i) => i.number)).toEqual(['pool-default', 'high-prio', 'unavail']);
  });
});
