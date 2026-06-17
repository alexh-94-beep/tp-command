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

export type BookingEmailKind =
  | 'new'
  | 'cancelled'
  | 'guest_message'
  | 'booking_modified'
  | 'arrivals_summary'
  | null;

/** Erkennbar als Booking.com (vom Absender)? */
export function isBookingSender(from: string | null | undefined): boolean {
  if (!from) return false;
  const lo = from.toLowerCase();
  return (
    lo.includes('@booking.com') ||
    lo.includes('@noreply.booking.com') ||
    lo.includes('@customer-service.booking.com') ||
    lo.includes('@guest.booking.com')
  );
}

/** Absender = Gast-Maskierung (z.B. "Esther über Booking.com" <...@guest.booking.com>)? */
export function isGuestProxyAddress(from: string | null | undefined): boolean {
  return !!from && from.toLowerCase().includes('@guest.booking.com');
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

  // Gast-Nachricht: From ist @guest.booking.com ODER Subject "Nachricht von"
  if (
    isGuestProxyAddress(from) ||
    lo.includes('nachricht von') ||
    lo.includes('message from') ||
    lo.includes('message de')
  ) {
    return 'guest_message';
  }

  // Arrivals-Summary: tägliche Übersichts-Mail
  if (
    lo.includes("today's or tomorrow's arrival") ||
    lo.includes('arrival date for') ||
    lo.includes('anreise von heute oder morgen')
  ) {
    return 'arrivals_summary';
  }

  // Buchungs-Änderung (Datum / Aufenthaltsdauer): "Eine Buchung wurde
  // geändert" / "Booking modified" — existierende Buchung wird geupdated
  if (
    lo.includes('buchung wurde geändert') ||
    lo.includes('buchung geändert') ||
    lo.includes('booking modified') ||
    lo.includes('booking has been modified') ||
    lo.includes('datumsänderung') ||
    // Bestätigung einer Gast-Anfrage (Late CO / Early CI / Datumswunsch)
    // → bestehende Buchung wird modifiziert, KEINE neue Buchung
    (lo.includes('anfrage von') && lo.includes('bestätigt')) ||
    (lo.includes('request from') && lo.includes('confirmed'))
  ) {
    return 'booking_modified';
  }

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
    lo.includes('buchung:') ||
    // Booking.com-typisches Format: "Booking.com - Eine neue Buchung! (UID, Datum)"
    lo.includes('eine neue buchung') ||
    // Last-Minute-Buchungen (kommen kurz vor Anreise)
    lo.includes('last-minute-buchung') ||
    lo.includes('last minute booking')
  ) {
    return 'new';
  }

  return null;
}

// ── Arrivals-Summary parsen ────────────────────────────────────────────

export interface ArrivalsSummaryEntry {
  externalUid: string;
  guestName: string | null;
  bookingDetailUrl: string | null;
}

/**
 * Extrahiert alle Buchungs-Nrn aus einer "Reservations with today's or
 * tomorrow's arrival date"-Mail. Booking listet sie als Tabelle mit
 * res_id-Links — wir gehen ueber alle Links durch und deduplizieren
 * nach externalUid.
 */
export function parseArrivalsSummary(body: string): ArrivalsSummaryEntry[] {
  const seen = new Set<string>();
  const entries: ArrivalsSummaryEntry[] = [];

  // Alle res_id-URLs sammeln
  const urlMatches = body.matchAll(
    /https?:\/\/[^\s<>"']*booking\.com[^\s<>"']*[?&]res_id=(\d{8,12})[^\s<>"']*/gi,
  );
  for (const m of urlMatches) {
    const uid = m[1];
    if (seen.has(uid)) continue;
    seen.add(uid);
    entries.push({
      externalUid: uid,
      guestName: null, // Tabellen-Parse ist fragil; Office sieht Name im Extranet
      bookingDetailUrl: cleanTrailingPunct(m[0]),
    });
  }

  return entries;
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
  // 1. URL-Parameter `res_id=NUMMER` — am zuverlaessigsten (Body von
  //    Gast-Mails enthaelt admin.booking.com-Link mit res_id)
  const resId = text.match(/[?&]res_id=(\d{8,12})/i);
  if (resId) return resId[1];
  // 2. Buchungs-Nr direkt mit Label (Pattern toleriert mehr Whitespace
  //    incl. Zeilenumbrueche — Booking-Mails haben oft Subject-Wraps)
  const labeled = text.match(
    /(?:buchungs[-\s]?nummer|buchungs[-\s]?nr|reservation\s*(?:number|nr)?|booking\s*(?:number|id)?|confirmation\s*(?:number|nr)?)[\s:]*(\d{8,12})/i,
  );
  if (labeled) return labeled[1];
  // 3. Subject-typisches Format: "(NUMMER, Wochentag, Datum)" oder
  //    "(NUMMER)"
  const inParens = text.match(/\(\s*(\d{8,12})[\s,)]/);
  if (inParens) return inParens[1];
  // 4. Fallback: erste 9–12-stellige Zahl, ABER ohne hotel_id
  const generic = text.match(/(?<!hotel_id=)\b(\d{9,12})\b/);
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
  // "15 June 2026" / "15 Juni 2026" / "15. Juni 2026" (DE mit Punkt)
  const monthName = s.match(/^(\d{1,2})\.?\s+([\p{L}]+)\.?\s+(\d{4})$/u);
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
 *
 * Strikte Variante (empfohlen): expectedUid setzen — nur URLs deren
 *   `res_id=` Parameter exakt der gefragten Buchungs-Nr entspricht
 *   werden akzeptiert. Damit faengt der Parser nicht aus Versehen
 *   Login-URLs, Tracking-Pixel oder URLs anderer Buchungen in derselben
 *   Mail.
 *
 * Naive Variante (ohne expectedUid): erste URL mit res_id/reservation_id,
 *   sonst erste mit Pfad/Query. Domain-only-URLs (`https://admin.booking.com.`)
 *   werden nie genommen.
 */
export function extractBookingDetailUrl(
  body: string,
  expectedUid?: string | null,
): string | null {
  const urls = body.match(/https?:\/\/[^\s<>"']+booking\.com[^\s<>"']*/gi);
  if (!urls || urls.length === 0) return null;

  // 1. Strikt: URL muss res_id=EXACT_UID enthalten
  if (expectedUid) {
    const exact = urls.find((u) => {
      const m = u.match(/[?&]res_id=(\d{8,12})/i);
      return m && m[1] === expectedUid;
    });
    if (exact) return cleanTrailingPunct(exact);
    // Strikter Modus: kein Match → null (KEIN Fallback auf falsche URL)
    return null;
  }

  // 2. Ohne expectedUid: URLs mit irgendeiner Buchungs-ID
  const withId = urls.find((u) =>
    /\b(res_id|reservation_id|bn|reservationid|bk|confirmationnumber)=/.test(u),
  );
  if (withId) return cleanTrailingPunct(withId);

  // 3. URLs mit Pfad (mehr als nur Domain) oder Query-String
  const withPath = urls.find((u) => {
    const cleaned = cleanTrailingPunct(u);
    const afterDomain = cleaned.replace(/^https?:\/\/[^\/]+/, '');
    return afterDomain.length > 0 && afterDomain !== '/';
  });
  if (withPath) return cleanTrailingPunct(withPath);

  return null;
}

function cleanTrailingPunct(u: string): string {
  return u.replace(/[.,;:!?)\]]+$/g, '');
}

// ── Datum aus Subject (Booking-typische Klammern) ──────────────────────

/**
 * Extrahiert das Anreisedatum aus dem Subject-Pattern von
 * Booking.com-Bestaetigungen, z.B.:
 *   "Booking.com - Eine neue Buchung! (5113511120, Mittwoch, 17. Juni 2026)"
 *   "Booking.com - New reservation! (5113511120, Wednesday, 17 June 2026)"
 * Liefert ISO YYYY-MM-DD oder null.
 */
export function extractDateFromSubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  // Suche Wochentag + Datum nach der Buchungs-Nr in den Klammern
  const m = subject.match(
    /\(\s*\d{8,12}\s*,\s*[\p{L}]+\s*,\s*(\d{1,2}\.?\s*[\p{L}]+\.?\s*\d{4})/u,
  );
  if (m) return normalizeDate(m[1].replace(/\.\s*/g, '. ').trim());
  // Fallback: irgendein Datum nach Wochentag
  const m2 = subject.match(/[\p{L}]+,\s*(\d{1,2}\.?\s*[\p{L}]+\.?\s*\d{4})/u);
  if (m2) return normalizeDate(m2[1].replace(/\.\s*/g, '. ').trim());
  return null;
}

// ── Gast-Nachrichten ───────────────────────────────────────────────────

export interface ParsedGuestMessage {
  /** Buchungs-Nr aus Body */
  externalUid: string;
  /** Gast-Name aus From-Display oder Subject */
  guestName: string | null;
}

/**
 * Parser fuer Gast-Nachricht-Benachrichtigungen.
 *   From: "Esther Buchmüller über Booking.com" <...@guest.booking.com>
 *   Subject: "Wir haben diese Nachricht von Esther Buchmüller erhalten"
 *   Body: "Buchungsnummer: 6238361486"
 */
export function parseGuestMessage(
  from: string | null | undefined,
  subject: string | null | undefined,
  body: string,
): ParsedGuestMessage | null {
  const externalUid = extractBookingNumber(body);
  if (!externalUid) return null;
  // From-Display: "Name über Booking.com" / "Name via Booking.com"
  let guestName: string | null = null;
  if (from) {
    const display = from.match(/^"?([^"<]+?)"?\s*(?:ueber|über|via)\s+Booking/i);
    if (display) guestName = display[1].trim();
  }
  if (!guestName && subject) {
    const subj = subject.match(
      /(?:nachricht\s+von|message\s+from|message\s+de)\s+([^\n<,]+?)\s+(?:erhalten|received|reçu)/i,
    );
    if (subj) guestName = subj[1].trim();
  }
  return { externalUid, guestName };
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
  // Datum aus Subject (Booking-Standard) bevorzugt — sonst aus Body suchen
  const subjectDate = extractDateFromSubject(subject);
  const { startDate: bodyStart, endDate } = extractDates(body);
  return {
    externalUid,
    bookingDetailUrl: extractBookingDetailUrl(body, externalUid),
    guestName: extractGuestName(subject),
    startDate: subjectDate ?? bodyStart,
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
