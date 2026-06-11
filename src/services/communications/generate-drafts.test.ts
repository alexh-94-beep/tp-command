import { describe, it, expect } from 'vitest';
import {
  shouldGenerateWelcome,
  shouldGenerateCheckin,
  shouldGenerateCheckout,
  shouldGenerateReminder,
  MIN_REMINDER_GAP_DAYS,
} from './generate-drafts';

describe('shouldGenerateWelcome', () => {
  it('Einzug genau in 7 Tagen → true', () => {
    expect(shouldGenerateWelcome('2026-06-18', '2026-06-11')).toBe(true);
  });
  it('Einzug in 6 Tagen → false', () => {
    expect(shouldGenerateWelcome('2026-06-17', '2026-06-11')).toBe(false);
  });
  it('Einzug in 8 Tagen → false', () => {
    expect(shouldGenerateWelcome('2026-06-19', '2026-06-11')).toBe(false);
  });
  it('Einzug heute → false (zu spaet)', () => {
    expect(shouldGenerateWelcome('2026-06-11', '2026-06-11')).toBe(false);
  });
});

describe('shouldGenerateCheckin', () => {
  it('Einzug morgen → true', () => {
    expect(shouldGenerateCheckin('2026-06-12', '2026-06-11')).toBe(true);
  });
  it('Einzug in 2 Tagen → false', () => {
    expect(shouldGenerateCheckin('2026-06-13', '2026-06-11')).toBe(false);
  });
  it('Einzug heute → false', () => {
    expect(shouldGenerateCheckin('2026-06-11', '2026-06-11')).toBe(false);
  });
});

describe('shouldGenerateCheckout', () => {
  it('Auszug in 3 Tagen → true', () => {
    expect(shouldGenerateCheckout('2026-06-14', '2026-06-11')).toBe(true);
  });
  it('Auszug in 2 Tagen → false', () => {
    expect(shouldGenerateCheckout('2026-06-13', '2026-06-11')).toBe(false);
  });
  it('Open-End (9999-12-31) → niemals', () => {
    expect(shouldGenerateCheckout('9999-12-31', '2026-06-11')).toBe(false);
  });
});

describe('shouldGenerateReminder', () => {
  it('Keine ueberfaellige Zahlung → false', () => {
    expect(shouldGenerateReminder(false, null, '2026-06-11')).toBe(false);
    expect(shouldGenerateReminder(false, '2026-06-01', '2026-06-11')).toBe(false);
  });
  it('Ueberfaellig + nie geschickt → true', () => {
    expect(shouldGenerateReminder(true, null, '2026-06-11')).toBe(true);
  });
  it('Letzter Reminder vor genau MIN_GAP Tagen → true', () => {
    const cutoff = '2026-06-04'; // heute -7
    expect(shouldGenerateReminder(true, cutoff, '2026-06-11')).toBe(true);
  });
  it('Letzter Reminder gestern → false', () => {
    expect(shouldGenerateReminder(true, '2026-06-10', '2026-06-11')).toBe(false);
  });
  it('Letzter Reminder vor 6 Tagen → false', () => {
    expect(shouldGenerateReminder(true, '2026-06-05', '2026-06-11')).toBe(false);
  });
  it('Letzter Reminder mit Timestamp (ISO mit Uhrzeit) → wird auf Datum gekuerzt', () => {
    expect(
      shouldGenerateReminder(true, '2026-06-04T15:30:00Z', '2026-06-11'),
    ).toBe(true);
  });
  it('MIN_REMINDER_GAP_DAYS Konstante ist 7', () => {
    expect(MIN_REMINDER_GAP_DAYS).toBe(7);
  });
});
