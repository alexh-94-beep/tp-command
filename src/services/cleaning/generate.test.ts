import { describe, it, expect } from 'vitest';
import { deriveSlot, pgTimestamp } from './generate';

describe('pgTimestamp', () => {
  it('formatiert mit Datum, Uhrzeit und TZ-Offset', () => {
    const d = new Date('2026-05-01T11:00:00+02:00');
    const s = pgTimestamp(d);
    expect(s).toMatch(/^2026-05-01 \d{2}:\d{2}:00[+-]\d{2}$/);
  });
});

describe('deriveSlot', () => {
  it('Booking ohne handover: nimmt end_date + check_out_time', () => {
    const slot = deriveSlot({
      rental_type: 'booking',
      end_date: '2026-09-15',
      check_out_time: '11:00',
      handover_planned_at: null,
      handover_completed_at: null,
    });
    expect(slot.date).toBe('2026-09-15');
    expect(slot.windowRange).toMatch(/^\[2026-09-15 11:00:00/);
    expect(slot.windowRange).toMatch(/2026-09-15 15:00:00.*\)$/); // +4h
  });

  it('Booking ohne check_out_time: Default 11:00', () => {
    const slot = deriveSlot({
      rental_type: 'booking',
      end_date: '2026-09-15',
      check_out_time: null,
      handover_planned_at: null,
      handover_completed_at: null,
    });
    expect(slot.windowRange).toMatch(/\[2026-09-15 11:00:00/);
  });

  it('Langzeit ohne check_out_time: Default 14:00', () => {
    const slot = deriveSlot({
      rental_type: 'long_term',
      end_date: '2026-12-31',
      check_out_time: null,
      handover_planned_at: null,
      handover_completed_at: null,
    });
    expect(slot.windowRange).toMatch(/\[2026-12-31 14:00:00/);
  });

  it('handover_planned_at hat Vorrang vor end_date: +1h Puffer', () => {
    const slot = deriveSlot({
      rental_type: 'long_term',
      end_date: '2026-12-31',
      check_out_time: '14:00',
      handover_planned_at: '2026-11-15T10:00:00+01:00',
      handover_completed_at: null,
    });
    expect(slot.date).toBe('2026-11-15');
    expect(slot.windowRange).toMatch(/\[2026-11-15 11:00:00/); // +1h Puffer
  });

  it('handover_completed_at wenn kein Plan: +1h Puffer', () => {
    const slot = deriveSlot({
      rental_type: 'short_term',
      end_date: '2026-12-31',
      check_out_time: null,
      handover_planned_at: null,
      handover_completed_at: '2026-08-20T15:00:00+02:00',
    });
    expect(slot.date).toBe('2026-08-20');
    expect(slot.windowRange).toMatch(/\[2026-08-20 16:00:00/);
  });
});

import { buildCheckoutCleaningNotes } from './generate';

describe('buildCheckoutCleaningNotes', () => {
  it('Booking-Auszug ohne Gast ohne Notiz', () => {
    const r = buildCheckoutCleaningNotes(null, null, 'booking', null, null);
    expect(r).toBe('Auszug Booking-Gast.');
  });

  it('Booking-Auszug mit Gast-Name', () => {
    const r = buildCheckoutCleaningNotes(null, null, 'booking', 'Tobias Hein', null);
    expect(r).toBe('Auszug Booking-Gast — Tobias Hein.');
  });

  it('Mit Booking-Notiz haengt sie unten dran', () => {
    const r = buildCheckoutCleaningNotes(
      null,
      null,
      'short_term',
      'Anna Mueller',
      'Klappbett benötigt',
    );
    expect(r).toContain('Auszug Mieter — Anna Mueller.');
    expect(r).toContain('Notiz aus Buchung:\nKlappbett benötigt');
  });

  it('Mit handover_planned_at kommt der Slot in den Header', () => {
    const r = buildCheckoutCleaningNotes(
      '2026-07-15T14:00:00Z',
      null,
      'long_term',
      'Familie Mueller',
      null,
    );
    expect(r).toMatch(/Geplant nach Wohnungsabnahme um/);
    expect(r).toContain('Familie Mueller');
  });
});
