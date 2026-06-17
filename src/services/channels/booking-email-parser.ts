/**
 * Booking.com Email-Parser.
 *
 * Klassifiziert eingehende Mails:
 *   - 'new'        → neue Reservation
 *   - 'cancelled'  → Storno einer existierenden Reservation
 *   - null         → keine relevante Mail, ignorieren
 *
 * Sprach-Varianten: Booking.com schickt je nach Account-Sprache DE / EN.
 * Wir matchen die jeweils typischen Subject-Patterns + Body-Felder.
 *
 * Diese Datei enthaelt KEINE IMAP- oder Supabase-Logik — nur reine
 * String-Parser. Vollstaendig testbar.
 */

// ── Klassifizierung ───────────────────────────────────────────────────

export type BookingEmailKind = 'new' | 'cancelled' | null;

/** Erkennbar als Booking.com (vom Absender)? */
export function isBookingSender(from: string | null | undefined): boolean {
  if (!from) return false;
  const lo = from.toLowerCase();
  return (
    lo.includes('@booking.com') ||
    lo.includes('@noreply.booking.com') ||
    lo.includes('@customer-service.booking.com')
  );
}

/**
 * Klassifiziert eine Mail anhand From + Subject.
 * Nicht-Booking-Mails → null (werden ignoriert).
 */
export function classifyBookingEmail(
  from: string | null | undefined,
  subject: string | null | undefined,
): BookingEmailKind {
  if (!isBookingSender(from)) return null;
  if (!subject) return null;

  const lo = subject.toLowerCase();

  // Storno-Patterns (DE/EN/FR)
  if (
    lo.includes('cancelled') ||
    lo.includes('cancellation') ||
    lo.includes('storniert') ||
    lo.includes('stornierung') ||
    lo.includes('annulé') ||
    lo.includes('annulation')
  ) {
    return 'cancelled';
  }

  // Neue-Reservation-Patterns
  if (
    lo.includes('new reservation') ||
    lo.includes('new booking') ||
    lo.includes('neue buchung') ||
    lo.includes('neue reservierung') ||
    lo.includes('nouvelle réservation') ||
    lo.includes('reservation:') ||
    lo.includes('buchung:')
  ) {
    return 'new';
  }

  return null;
}

// ── Field-Extraktion ───────────────────────────────────────────────────

export interface ParsedNewReservation {
  /** Booking-Nr / Confirmation-Nr (8-12 stellige Zahl) — Pflicht */
  externalUid: string;
  /**
   * Direkt-Link zur Buchung im Booking.com-Extranet, falls im Body
   * vorhanden. Office klickt drauf um Datum + Gast-Name dort zu sehen.
   */
  bookingDetailUrl: string | null;
  /**
   * Gast-Name "Vorname Nachname" — Booking.com schickt den bei der
   * Standard-Bestaetigung NICHT mit. Wir extrahieren best-effort und
   * lassen null wenn nichts gefunden wird.
   */
  guestName: string | null;
  /** Check-in YYYY-MM-DD — bei Standard-Bestaetigung meist null */
  startDate: string | null;
  /** Check-out YYYY-MM-DD — bei Standard-Bestaetigung meist null */
  endDate: string | null;
  /** Anzahl Gaeste, falls erkannt (selten) */
  guestCount: number | null;
}

export interface ParsedCancellation {
  externalUid: string;
}

/**
 * Extrahiert die Booking-Nr aus Subject oder Body.
 * Format: rein numerisch, 8–12 Stellen.
 */
export function extractBookingNumber(text: string): string | null {
  // Bevorzugt nahe "Buchungs-Nr" / "Booking number" / "Reservation"
  const labeled = text.match(
    /(?:buchungs[-\s]?nummer|buchungs[-\s]?nr|reservation\s*(?:number|nr)?|booking\s*(?:number|id)?|confirmation\s*(?:number|nr)?)\D{0,20}(\d{8,12})/i,
  );
  if (labeled) return labeled[1];
  // Fallback: erste 9–12-stellige Zahl
  const generic = text.match(/\b(\d{9,12})\b/);
  return generic ? generic[1] : null;
}

/**
 * Versucht Check-in / Check-out aus dem Mail-Text zu lesen.
 * Akzeptiert:
 *  - "Check-in: 15.06.2026" (DE)
 *  - "Check-out: 18.06.2026"
 *  - "Arrival: 15 June 2026"
 *  - "Departure: 18 June 2026"
 *  - ISO: 2026-06-15
 */
export function extractDates(text: string): {
  startDate: string | null;
  endDate: string | null;
} {
  const start = findDateAfterLabels(text, [
    'check-in',
    'check in',
    'arrival',
    'anreise',
    'anreisedatum',
    'einzug',
  ]);
  const end = findDateAfterLabels(text, [
    'check-out',
    'check out',
    'departure',
    'abreise',
    'abreisedatum',
    'auszug',
  ]);
  return { startDate: start, endDate: end };
}

function findDateAfterLabels(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `${escapeRegex(label)}\\D{0,30}(\\d{1,2}[.\\-/]\\s?\\d{1,2}[.\\-/]\\s?\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+\\w+\\s+\\d{4})`,
      'i',
    );
    const m = text.match(re);
    if (m) {
      const normalized = normalizeDate(m[1]);
      if (normalized) return normalized;
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalisiert verschiedene Datumsformate zu ISO YYYY-MM-DD.
 * Akzeptiert:
 *   2026-06-15
 *   15.06.2026 / 15.6.2026 / 15.06.26
 *   15/06/2026
 *   "15 June 2026" / "15 Juni 2026"
 */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DE/CH dd.mm.yyyy
  const dot = s.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})$/);
  if (dot) {
    const [, d, m, y] = dot;
    return iso(y, m, d);
  }
  // dd/mm/yyyy
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    return iso(y, m, d);
  }
  // "15 June 2026" / "15 Juni 2026"
  const monthName = s.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  if (monthName) {
    const [, d, name, y] = monthName;
    const m = monthFromName(name);
    if (m) return iso(y, String(m), d);
  }
  return null;
}

function iso(year: string, month: string, day: string): string {
  const y = year.length === 2 ? `20${year}` : year;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthFromName(name: string): number | null {
  const map: Record<string, number> = {
    january: 1,
    februar: 2,
    february: 2,
    march: 3,
    märz: 3,
    april: 4,
    may: 5,
    mai: 5,
    june: 6,
    juni: 6,
    july: 7,
    juli: 7,
    august: 8,
    september: 9,
    october: 10,
    oktober: 10,
    november: 11,
    december: 12,
    dezember: 12,
    januar: 1,
  };
  return map[name.toLowerCase()] ?? null;
}

/** Anzahl Gäste (Erwachsene + Kinder) aus dem Mail-Text. */
export function extractGuestCount(text: string): number | null {
  // Variante A: Label vor der Zahl ("Gäste: 2", "Number of guests: 4")
  const labelFirst = text.match(
    /(?:guests?|g[äa]ste|personen|adults?|erwachsene)\D{0,10}(\d{1,2})/i,
  );
  if (labelFirst) return parseInt(labelFirst[1], 10);
  // Variante B: Zahl vor dem Label ("3 Gäste", "2 guests", "4 Erwachsene")
  const numFirst = text.match(
    /\b(\d{1,2})\s+(?:guests?|g[äa]ste|personen|adults?|erwachsene)\b/i,
  );
  if (numFirst) return parseInt(numFirst[1], 10);
  return null;
}

/**
 * Extrahiert den Link zur konkreten Buchung in Booking.com Extranet.
 * Typische URLs:
 *   - https://admin.booking.com/hotel/hoteladmin/extranet_ng/...?res_id=1234567890
 *   - https://secure.booking.com/...
 *
 * Bevorzugt URLs mit res_id/reservation_id; fallback ist die erste
 * booking.com-URL im Text.
 */
export function extractBookingDetailUrl(body: string): string | null {
  const urls = body.match(/https?:\/\/[^\s<>"']+booking\.com[^\s<>"']*/gi);
  if (!urls || urls.length === 0) return null;
  const withId = urls.find((u) =>
    /\b(res_id|reservation_id|bn|reservationid|bk)=?/.test(u),
  );
  return withId ?? urls[0];
}

/** Gast-Name aus typischen Subject-Patterns. */
export function extractGuestName(subject: string | null | undefined): string | null {
  if (!subject) return null;
  // "Neue Buchung von Max Mustermann (1234567890)"
  // "New reservation from John Doe"
  // "Reservation by Anna Müller"
  const m = subject.match(
    /(?:von|from|by|für|de)\s+([A-Z][\p{L}'\- ]+?)(?:\s*[(,-]|\s*$)/u,
  );
  if (m) return m[1].trim();
  return null;
}

/**
 * Hauptparser fuer eine "Neue Reservation"-Mail.
 *
 * Booking.com schickt bei der Standard-Bestaetigung NUR:
 *   - Buchungsnummer
 *   - Link zur Buchung im Extranet
 * Datum, Gast-Name, Dauer kommen NICHT mit — Office muss im Extranet
 * nachschauen.
 *
 * Pflicht-Output: externalUid. Alles andere best-effort / null.
 */
export function parseNewReservation(
  subject: string,
  body: string,
): ParsedNewReservation | null {
  const haystack = `${subject}\n${body}`;
  const externalUid = extractBookingNumber(haystack);
  if (!externalUid) return null;
  const { startDate, endDate } = extractDates(body);
  return {
    externalUid,
    bookingDetailUrl: extractBookingDetailUrl(body),
    guestName: extractGuestName(subject),
    startDate,
    endDate,
    guestCount: extractGuestCount(body),
  };
}

/**
 * Hauptparser fuer eine "Storno"-Mail.
 * Wir brauchen nur die externalUid; falls die nicht zu finden ist → null.
 */
export function parseCancellation(
  subject: string,
  body: string,
): ParsedCancellation | null {
  const haystack = `${subject}\n${body}`;
  const externalUid = extractBookingNumber(haystack);
  if (!externalUid) return null;
  return { externalUid };
}
