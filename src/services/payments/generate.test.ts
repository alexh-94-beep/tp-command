import { describe, it, expect } from 'vitest';
import {
  preCheckinDueDate,
  monthlyRentDueDate,
  plannedPaymentsAtCreation,
  nextMonthlyDueDates,
} from './generate';

describe('preCheckinDueDate', () => {
  it('Einzug in mehr als 14 Tagen → 14 Tage davor', () => {
    expect(preCheckinDueDate('2026-07-30', '2026-06-01')).toBe('2026-07-16');
  });
  it('Einzug naeher als 14 Tage → heute', () => {
    expect(preCheckinDueDate('2026-06-10', '2026-06-01')).toBe('2026-06-01');
  });
  it('Einzug gleich heute → heute', () => {
    expect(preCheckinDueDate('2026-06-01', '2026-06-01')).toBe('2026-06-01');
  });
  it('Einzug in der Vergangenheit → heute (Nacherfassung)', () => {
    expect(preCheckinDueDate('2026-05-15', '2026-06-01')).toBe('2026-06-01');
  });
});

describe('monthlyRentDueDate', () => {
  it('Einzug 14.7., offset 1 → 2026-08-01', () => {
    expect(monthlyRentDueDate('2026-07-14', 1)).toBe('2026-08-01');
  });
  it('Einzug 14.7., offset 6 → 2027-01-01 (Jahreswechsel)', () => {
    expect(monthlyRentDueDate('2026-07-14', 6)).toBe('2027-01-01');
  });
  it('Einzug 30.12.2026, offset 1 → 2027-01-01', () => {
    expect(monthlyRentDueDate('2026-12-30', 1)).toBe('2027-01-01');
  });
  it('Einzug 30.12.2026, offset 13 → 2028-01-01', () => {
    expect(monthlyRentDueDate('2026-12-30', 13)).toBe('2028-01-01');
  });
});

describe('plannedPaymentsAtCreation: long_term', () => {
  it('Vollvariante: Depot + Erst-Miete', () => {
    const out = plannedPaymentsAtCreation(
      {
        rental_type: 'long_term',
        start_date: '2026-07-15',
        end_date: '9999-12-31',
        rent_amount: 1500,
        deposit_amount: 3000,
        short_term_flat_rate: null,
      },
      '2026-06-01',
    );
    expect(out).toEqual([
      { type: 'deposit', amount: 3000, due_date: '2026-06-01' },
      { type: 'first_rent', amount: 1500, due_date: '2026-07-01' },
    ]);
  });

  it('Ohne Depot: nur Erst-Miete', () => {
    const out = plannedPaymentsAtCreation(
      {
        rental_type: 'long_term',
        start_date: '2026-07-15',
        end_date: '9999-12-31',
        rent_amount: 1500,
        deposit_amount: 0,
        short_term_flat_rate: null,
      },
      '2026-06-01',
    );
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('first_rent');
  });

  it('Miete 0: keine first_rent erzeugt', () => {
    const out = plannedPaymentsAtCreation(
      {
        rental_type: 'long_term',
        start_date: '2026-07-15',
        end_date: '9999-12-31',
        rent_amount: 0,
        deposit_amount: 3000,
        short_term_flat_rate: null,
      },
      '2026-06-01',
    );
    expect(out).toEqual([
      { type: 'deposit', amount: 3000, due_date: '2026-06-01' },
    ]);
  });
});

describe('plannedPaymentsAtCreation: short_term', () => {
  it('Pauschale aus short_term_flat_rate, Depot dazu', () => {
    const out = plannedPaymentsAtCreation(
      {
        rental_type: 'short_term',
        start_date: '2026-07-15',
        end_date: '2026-07-22',
        rent_amount: 1500,
        deposit_amount: 500,
        short_term_flat_rate: 1200,
      },
      '2026-06-01',
    );
    expect(out).toEqual([
      { type: 'short_term_flat', amount: 1200, due_date: '2026-07-01' },
      { type: 'deposit', amount: 500, due_date: '2026-07-01' },
    ]);
  });

  it('Ohne short_term_flat_rate: fallback auf rent_amount', () => {
    const out = plannedPaymentsAtCreation(
      {
        rental_type: 'short_term',
        start_date: '2026-07-15',
        end_date: '2026-07-22',
        rent_amount: 1500,
        deposit_amount: 0,
        short_term_flat_rate: null,
      },
      '2026-06-01',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      type: 'short_term_flat',
      amount: 1500,
      due_date: '2026-07-01',
    });
  });
});

describe('plannedPaymentsAtCreation: booking', () => {
  it('Booking-Payout 14 Tage nach Auszug', () => {
    const out = plannedPaymentsAtCreation(
      {
        rental_type: 'booking',
        start_date: '2026-07-15',
        end_date: '2026-07-22',
        rent_amount: 800,
        deposit_amount: 0,
        short_term_flat_rate: null,
      },
      '2026-06-01',
    );
    expect(out).toEqual([
      { type: 'booking_payout', amount: 800, due_date: '2026-08-05' },
    ]);
  });

  it('Open-end (9999-12-31): kein Payout (unsinnig)', () => {
    const out = plannedPaymentsAtCreation(
      {
        rental_type: 'booking',
        start_date: '2026-07-15',
        end_date: '9999-12-31',
        rent_amount: 800,
        deposit_amount: 0,
        short_term_flat_rate: null,
      },
      '2026-06-01',
    );
    expect(out).toHaveLength(0);
  });
});

describe('nextMonthlyDueDates', () => {
  it('Einzug 14.7., heute 15.7. → naechste 2 sind Aug+Sep', () => {
    expect(nextMonthlyDueDates('2026-07-14', '2026-07-15', 2)).toEqual([
      '2026-08-01',
      '2026-09-01',
    ]);
  });

  it('Einzug 14.7., heute 1.6. (Buchung in der Zukunft) → August + September (Juli ist first_rent)', () => {
    expect(nextMonthlyDueDates('2026-07-14', '2026-06-01', 2)).toEqual([
      '2026-08-01',
      '2026-09-01',
    ]);
  });

  it('Einzug 14.7., heute 5.9. (laufender Vertrag) → September + Oktober', () => {
    expect(nextMonthlyDueDates('2026-07-14', '2026-09-05', 2)).toEqual([
      '2026-09-01',
      '2026-10-01',
    ]);
  });

  it('Jahreswechsel: heute 15.12.26 → 2026-12 + 2027-01 (nachhol-Fenster)', () => {
    expect(nextMonthlyDueDates('2026-07-14', '2026-12-15', 2)).toEqual([
      '2026-12-01',
      '2027-01-01',
    ]);
  });

  it('lookaheadMonths=1 reduziert die Anzahl', () => {
    expect(nextMonthlyDueDates('2026-07-14', '2026-07-15', 1)).toEqual([
      '2026-08-01',
    ]);
  });
});
