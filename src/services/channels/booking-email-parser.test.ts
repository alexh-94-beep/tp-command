import { describe, it, expect } from 'vitest';
import {
  isBookingSender,
  classifyBookingEmail,
  extractBookingNumber,
  extractDates,
  normalizeDate,
  extractGuestCount,
  extractGuestName,
  extractBookingDetailUrl,
  parseNewReservation,
  parseCancellation,
} from './booking-email-parser';

describe('isBookingSender', () => {
  it('booking.com → true', () => {
    expect(isBookingSender('noreply@booking.com')).toBe(true);
    expect(isBookingSender('Customer Service <customer-service@booking.com>')).toBe(
      true,
    );
  });
  it('andere → false', () => {
    expect(isBookingSender('info@example.com')).toBe(false);
    expect(isBookingSender(null)).toBe(false);
  });
});

describe('classifyBookingEmail', () => {
  it('Storno DE → cancelled', () => {
    expect(
      classifyBookingEmail(
        'noreply@booking.com',
        'Buchung storniert: 1234567890 - Max Mustermann',
      ),
    ).toBe('cancelled');
  });
  it('Storno EN → cancelled', () => {
    expect(
      classifyBookingEmail(
        'noreply@booking.com',
        'Reservation cancelled: Booker name',
      ),
    ).toBe('cancelled');
  });
  it('Neue Reservation DE → new', () => {
    expect(
      classifyBookingEmail(
        'noreply@booking.com',
        'Neue Buchung von Max Mustermann (1234567890)',
      ),
    ).toBe('new');
  });
  it('Neue Reservation EN → new', () => {
    expect(
      classifyBookingEmail(
        'noreply@booking.com',
        'New reservation: John Doe (9876543210)',
      ),
    ).toBe('new');
  });
  it('Nicht-Booking → null', () => {
    expect(
      classifyBookingEmail('mieter@example.com', 'Frage zur Wohnung'),
    ).toBeNull();
  });
  it('Booking aber irrelevantes Subject → null', () => {
    expect(
      classifyBookingEmail('noreply@booking.com', 'Monatliches Reporting verfügbar'),
    ).toBeNull();
  });
});

describe('extractBookingNumber', () => {
  it('labeled', () => {
    expect(extractBookingNumber('Buchungs-Nr: 1234567890 ...')).toBe('1234567890');
    expect(extractBookingNumber('Booking number 9876543210')).toBe('9876543210');
  });
  it('aus Subject', () => {
    expect(extractBookingNumber('Neue Buchung von Max (1234567890)')).toBe(
      '1234567890',
    );
  });
  it('keine Nummer → null', () => {
    expect(extractBookingNumber('keine Zahlen hier')).toBeNull();
  });
  it('ignoriert kurze Zahlen', () => {
    expect(extractBookingNumber('Tag: 15 Uhr 8')).toBeNull();
  });
});

describe('normalizeDate', () => {
  it('ISO bleibt', () => {
    expect(normalizeDate('2026-06-15')).toBe('2026-06-15');
  });
  it('DE Format dd.mm.yyyy', () => {
    expect(normalizeDate('15.06.2026')).toBe('2026-06-15');
    expect(normalizeDate('5.6.2026')).toBe('2026-06-05');
  });
  it('dd/mm/yyyy', () => {
    expect(normalizeDate('15/06/2026')).toBe('2026-06-15');
  });
  it('"15 June 2026"', () => {
    expect(normalizeDate('15 June 2026')).toBe('2026-06-15');
    expect(normalizeDate('15 Juni 2026')).toBe('2026-06-15');
  });
  it('2-stelliges Jahr', () => {
    expect(normalizeDate('15.06.26')).toBe('2026-06-15');
  });
  it('unsinnig → null', () => {
    expect(normalizeDate('foo')).toBeNull();
  });
});

describe('extractDates', () => {
  it('DE Check-in/Check-out', () => {
    const body = `
      Check-in: 15.06.2026
      Check-out: 18.06.2026
    `;
    expect(extractDates(body)).toEqual({
      startDate: '2026-06-15',
      endDate: '2026-06-18',
    });
  });
  it('EN Arrival/Departure', () => {
    const body = 'Arrival: 15 June 2026\nDeparture: 18 June 2026';
    expect(extractDates(body)).toEqual({
      startDate: '2026-06-15',
      endDate: '2026-06-18',
    });
  });
  it('nichts erkannt → beide null', () => {
    expect(extractDates('keine Daten hier')).toEqual({
      startDate: null,
      endDate: null,
    });
  });
});

describe('extractGuestCount', () => {
  it('"3 Gäste"', () => {
    expect(extractGuestCount('Reservation für 3 Gäste')).toBe(3);
  });
  it('"2 guests"', () => {
    expect(extractGuestCount('Number of guests: 2')).toBe(2);
  });
  it('Erwachsene', () => {
    expect(extractGuestCount('Erwachsene: 4')).toBe(4);
  });
  it('nichts → null', () => {
    expect(extractGuestCount('—')).toBeNull();
  });
});

describe('extractGuestName', () => {
  it('"Neue Buchung von Max Mustermann (123)"', () => {
    expect(extractGuestName('Neue Buchung von Max Mustermann (1234567890)')).toBe(
      'Max Mustermann',
    );
  });
  it('"New reservation from John Doe"', () => {
    expect(extractGuestName('New reservation from John Doe')).toBe('John Doe');
  });
  it('Sonderzeichen Umlaut', () => {
    expect(extractGuestName('Buchung von Anna Müller (123456789)')).toBe(
      'Anna Müller',
    );
  });
  it('kein Match → null', () => {
    expect(extractGuestName('Booking Confirmation 1234')).toBeNull();
  });
});

describe('extractBookingDetailUrl', () => {
  it('admin.booking.com mit res_id', () => {
    const body =
      'Buchung anzeigen: https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/reservations.html?res_id=1234567890\n';
    expect(extractBookingDetailUrl(body)).toContain('res_id=1234567890');
  });
  it('bevorzugt res_id wenn mehrere booking-URLs', () => {
    const body = `
      Login: https://admin.booking.com/login
      Buchung: https://admin.booking.com/reservation?res_id=999
    `;
    expect(extractBookingDetailUrl(body)).toContain('res_id=999');
  });
  it('keine booking-URL → null', () => {
    expect(extractBookingDetailUrl('https://example.com/foo')).toBeNull();
  });
});

describe('parseNewReservation', () => {
  it('Standard-Bestaetigung: nur Nr + Link', () => {
    const subject = 'New Reservation (1234567890)';
    const body =
      'Sie haben eine neue Buchung. Buchungs-Nr: 1234567890\n' +
      'Details: https://admin.booking.com/reservation?res_id=1234567890\n';
    const r = parseNewReservation(subject, body);
    expect(r).toEqual({
      externalUid: '1234567890',
      bookingDetailUrl: expect.stringContaining('res_id=1234567890'),
      guestName: null,
      startDate: null,
      endDate: null,
      guestCount: null,
    });
  });
  it('Spezial-Anfrage mit vollem DE-Body', () => {
    const subject = 'Neue Buchung von Max Mustermann (1234567890)';
    const body = `
Buchungs-Nr: 1234567890
Check-in: 15.06.2026
Check-out: 18.06.2026
Gäste: 2
https://admin.booking.com/reservation?res_id=1234567890
    `;
    const r = parseNewReservation(subject, body);
    expect(r?.externalUid).toBe('1234567890');
    expect(r?.guestName).toBe('Max Mustermann');
    expect(r?.startDate).toBe('2026-06-15');
    expect(r?.endDate).toBe('2026-06-18');
    expect(r?.guestCount).toBe(2);
    expect(r?.bookingDetailUrl).toContain('res_id=1234567890');
  });
  it('ohne Buchungs-Nr → null', () => {
    expect(parseNewReservation('Hallo', 'Text ohne Nummer')).toBeNull();
  });
});

describe('parseCancellation', () => {
  it('extrahiert UID aus Subject', () => {
    expect(
      parseCancellation('Buchung storniert: 1234567890', 'Body egal'),
    ).toEqual({ externalUid: '1234567890' });
  });
  it('ohne UID → null', () => {
    expect(parseCancellation('Storno', 'keine Nr')).toBeNull();
  });
});
