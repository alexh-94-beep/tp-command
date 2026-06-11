import { describe, it, expect } from 'vitest';
import { renderTemplate, type TemplateContext } from './templates';
import { buildContextFromBooking, type BookingForRender } from './render';

const baseBooking: BookingForRender = {
  start_date: '2026-08-01',
  end_date: '2026-08-08',
  rent_amount: 1500,
  deposit_amount: 3000,
  rental_type: 'long_term',
  apartment: { number: 'C.0301', building: 'C' },
  tenant: { first_name: 'Anna', last_name: 'Müller', email: 'anna@example.com' },
};

describe('buildContextFromBooking', () => {
  it('mappt Felder 1:1', () => {
    const ctx = buildContextFromBooking(baseBooking);
    expect(ctx.guestFirstName).toBe('Anna');
    expect(ctx.guestLastName).toBe('Müller');
    expect(ctx.apartmentNumber).toBe('C.0301');
    expect(ctx.apartmentBuilding).toBe('C');
    expect(ctx.rentAmount).toBe(1500);
    expect(ctx.depositAmount).toBe(3000);
    expect(ctx.rentalType).toBe('long_term');
  });

  it('Tenant ohne Vorname → fallback "Gast"', () => {
    const ctx = buildContextFromBooking({
      ...baseBooking,
      tenant: { first_name: null, last_name: null, email: null },
    });
    expect(ctx.guestFirstName).toBe('Gast');
    expect(ctx.guestLastName).toBe('');
  });

  it('extras werden gemergt', () => {
    const ctx = buildContextFromBooking(baseBooking, {
      wifiSsid: 'TP-Guest',
      wifiPassword: 'secret',
      keyBoxCode: '1234',
    });
    expect(ctx.wifiSsid).toBe('TP-Guest');
    expect(ctx.keyBoxCode).toBe('1234');
  });
});

const baseCtx: TemplateContext = buildContextFromBooking(baseBooking);

describe('Templates: welcome', () => {
  it('Subject enthaelt Wohnungs-Nr', () => {
    const r = renderTemplate('welcome', baseCtx);
    expect(r.subject).toContain('C.0301');
    expect(r.subject).toContain('Willkommen');
  });
  it('Body enthaelt Gastnamen + Daten', () => {
    const r = renderTemplate('welcome', baseCtx);
    expect(r.body).toContain('Anna Müller');
    expect(r.body).toContain('01.08.2026');
    expect(r.body).toContain('08.08.2026');
    expect(r.body).toContain('CHF');
  });
  it('Open-End wird als "unbefristet" angezeigt', () => {
    const r = renderTemplate('welcome', {
      ...baseCtx,
      endDate: '9999-12-31',
    });
    expect(r.body).toContain('unbefristet');
    expect(r.body).not.toContain('9999');
  });
  it('Kein Depot-Hinweis wenn deposit_amount=0', () => {
    const r = renderTemplate('welcome', { ...baseCtx, depositAmount: 0 });
    expect(r.body).not.toContain('Depot');
  });
});

describe('Templates: checkin', () => {
  it('Schluesselbox-Code wird gerendert wenn vorhanden', () => {
    const r = renderTemplate('checkin_info', { ...baseCtx, keyBoxCode: '4242' });
    expect(r.body).toContain('4242');
  });
  it('Ohne Code: Hinweis "Code folgt am Vortag"', () => {
    const r = renderTemplate('checkin_info', baseCtx);
    expect(r.body).toContain('Vortag');
  });
});

describe('Templates: wifi', () => {
  it('Platzhalter wenn keine Daten', () => {
    const r = renderTemplate('wifi_info', baseCtx);
    expect(r.body).toContain('bitte ergänzen');
  });
  it('Daten werden eingesetzt', () => {
    const r = renderTemplate('wifi_info', {
      ...baseCtx,
      wifiSsid: 'TP-Gast',
      wifiPassword: 'p@ss',
    });
    expect(r.body).toContain('TP-Gast');
    expect(r.body).toContain('p@ss');
  });
});

describe('Templates: payment_reminder', () => {
  it('Faelligkeit + Referenz wird gerendert', () => {
    const r = renderTemplate('payment_reminder', {
      ...baseCtx,
      paymentDueDate: '2026-07-15',
      paymentAmount: 1500,
      paymentReference: 'INV-001',
    });
    expect(r.body).toContain('15.07.2026');
    expect(r.body).toContain('INV-001');
    expect(r.body).toMatch(/1.500\.00/); // Apostroph variiert je nach Node-Version
  });
});

describe('Templates: checkout', () => {
  it('Langzeit: Depot-Hinweis enthalten', () => {
    const r = renderTemplate('checkout_info', baseCtx);
    expect(r.body).toContain('Depot');
  });
  it('Kurzzeit: kein Depot-Hinweis', () => {
    const r = renderTemplate('checkout_info', {
      ...baseCtx,
      rentalType: 'short_term',
    });
    expect(r.body).not.toContain('Depot');
  });
  it('Booking: kein Depot-Hinweis', () => {
    const r = renderTemplate('checkout_info', {
      ...baseCtx,
      rentalType: 'booking',
    });
    expect(r.body).not.toContain('Depot');
  });
});

describe('Templates: unimplemented keys', () => {
  it('throws für payment_info', () => {
    expect(() => renderTemplate('payment_info', baseCtx)).toThrow();
  });
  it('throws für internal_cleaning_notification', () => {
    expect(() => renderTemplate('internal_cleaning_notification', baseCtx)).toThrow();
  });
});
