import { describe, it, expect } from 'vitest';
import { computeMirrorRange, inferMirrorRentalType } from './grid';

describe('inferMirrorRentalType', () => {
  it('booking_active -> booking', () => {
    expect(inferMirrorRentalType('booking_active')).toBe('booking');
  });

  it.each(['occupied', 'terminated', 'contract_pending', 'available'] as const)(
    '%s -> long_term',
    (s) => {
      expect(inferMirrorRentalType(s)).toBe('long_term');
    },
  );
});

describe('computeMirrorRange', () => {
  it('Status occupied + Label -> Range', () => {
    const r = computeMirrorRange({
      status: 'occupied',
      current_tenant_label: 'Anna Müller',
      current_move_in: '2026-01-01',
      current_move_out: '2026-12-31',
    });
    expect(r).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('Status available + Label (z. B. Excel-Notiz) -> Range', () => {
    // Mieter-Spalte kann auch Notizen tragen ("Putzraum - Kontrolle") obwohl
    // Status verfuegbar ist. Wir nehmen es trotzdem in den Kalender auf.
    const r = computeMirrorRange({
      status: 'available',
      current_tenant_label: 'Putzraum',
      current_move_in: null,
      current_move_out: null,
    });
    expect(r).not.toBeNull();
    expect(r?.start).toBe('0001-01-01');
    expect(r?.end).toBe('9999-12-31');
  });

  it('Status available ohne Label -> kein Range', () => {
    const r = computeMirrorRange({
      status: 'available',
      current_tenant_label: null,
      current_move_in: null,
      current_move_out: null,
    });
    expect(r).toBeNull();
  });

  it('Datums-Inkonsistenz (end <= start) -> end auf 9999-12-31', () => {
    const r = computeMirrorRange({
      status: 'occupied',
      current_tenant_label: 'X',
      current_move_in: '2026-06-01',
      current_move_out: '2026-01-01',
    });
    expect(r?.end).toBe('9999-12-31');
  });
});
