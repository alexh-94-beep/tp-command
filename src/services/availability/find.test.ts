import { describe, it, expect } from 'vitest';
import { addYearsIso, computeMirrorConflict } from './find';

describe('addYearsIso', () => {
  it('addiert Jahre auf ein ISO-Datum', () => {
    expect(addYearsIso('2026-05-01', 10)).toBe('2036-05-01');
  });

  it('handhabt 29.02. in Schaltjahren', () => {
    expect(addYearsIso('2024-02-29', 1)).toBe('2025-03-01'); // 2025 ist kein Schaltjahr
  });
});

describe('computeMirrorConflict', () => {
  it('Status mit Spiegel: occupied -> applies, start/end aus Excel', () => {
    const r = computeMirrorConflict({
      status: 'occupied',
      current_move_in: '2026-01-01',
      current_move_out: '2026-12-31',
      today: '2026-06-01',
    });
    expect(r.applies).toBe(true);
    if (r.applies) {
      expect(r.start).toBe('2026-01-01');
      expect(r.end).toBe('2026-12-31');
    }
  });

  it('Status ohne Spiegel: available -> applies=false', () => {
    const r = computeMirrorConflict({
      status: 'available',
      current_move_in: null,
      current_move_out: null,
      today: '2026-06-01',
    });
    expect(r.applies).toBe(false);
  });

  it('move_in fehlt -> Default 0001-01-01', () => {
    const r = computeMirrorConflict({
      status: 'occupied',
      current_move_in: null,
      current_move_out: '2026-12-31',
      today: '2026-06-01',
    });
    expect(r.applies).toBe(true);
    if (r.applies) expect(r.start).toBe('0001-01-01');
  });

  it('move_out fehlt -> Default 9999-12-31 (open end)', () => {
    const r = computeMirrorConflict({
      status: 'occupied',
      current_move_in: '2026-01-01',
      current_move_out: null,
      today: '2026-06-01',
    });
    expect(r.applies).toBe(true);
    if (r.applies) expect(r.end).toBe('9999-12-31');
  });

  it('Inkonsistenz: move_out vor move_in -> end auf 9999-12-31 reparieren', () => {
    const r = computeMirrorConflict({
      status: 'occupied',
      current_move_in: '2026-06-01',
      current_move_out: '2026-01-01', // < move_in
      today: '2026-06-01',
    });
    expect(r.applies).toBe(true);
    if (r.applies) {
      expect(r.start).toBe('2026-06-01');
      expect(r.end).toBe('9999-12-31');
    }
  });

  it('Inkonsistenz: occupied aber move_out in der Vergangenheit -> open end', () => {
    const r = computeMirrorConflict({
      status: 'occupied',
      current_move_in: '2025-01-01',
      current_move_out: '2025-12-31',
      today: '2026-06-01',
    });
    expect(r.applies).toBe(true);
    if (r.applies) expect(r.end).toBe('9999-12-31');
  });

  it('Sonderfall: terminated mit move_out in der Vergangenheit NICHT reparieren', () => {
    // terminated = gekuendigt; ein abgelaufener move_out ist hier korrekt
    // und soll nicht zu 9999-12-31 hochgezogen werden.
    const r = computeMirrorConflict({
      status: 'terminated',
      current_move_in: '2025-01-01',
      current_move_out: '2025-12-31',
      today: '2026-06-01',
    });
    expect(r.applies).toBe(true);
    if (r.applies) expect(r.end).toBe('2025-12-31');
  });

  it.each(['booking_active', 'contract_pending'] as const)(
    'Status %s wird wie occupied behandelt (Spiegel + Repair)',
    (status) => {
      const r = computeMirrorConflict({
        status,
        current_move_in: '2025-01-01',
        current_move_out: '2025-12-31',
        today: '2026-06-01',
      });
      expect(r.applies).toBe(true);
      if (r.applies) expect(r.end).toBe('9999-12-31');
    },
  );
});
