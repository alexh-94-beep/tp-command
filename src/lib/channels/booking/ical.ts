/**
 * Minimaler iCalendar-Parser. Reicht für Booking.com / Airbnb / Expedia,
 * die alle ein simples VCALENDAR mit VEVENT-Blöcken liefern.
 */

export interface ICalEvent {
  uid: string;
  start: string;            // ISO YYYY-MM-DD (date) oder YYYY-MM-DDTHH:mm:ss
  end: string;              // exklusiv
  summary: string;
  description?: string;
}

export function parseICal(text: string): ICalEvent[] {
  // RFC 5545: Folgezeilen, die mit Space oder Tab beginnen, gehören zur vorherigen Zeile
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events: ICalEvent[] = [];
  let cur: Partial<ICalEvent> | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur && cur.uid && cur.start && cur.end) {
        events.push({
          uid: cur.uid,
          start: cur.start,
          end: cur.end,
          summary: cur.summary ?? 'Reservation',
          description: cur.description,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const keyPart = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const key = keyPart.split(';')[0];

    switch (key) {
      case 'UID':
        cur.uid = value;
        break;
      case 'DTSTART':
        cur.start = parseDate(value);
        break;
      case 'DTEND':
        cur.end = parseDate(value);
        break;
      case 'SUMMARY':
        cur.summary = unescape(value);
        break;
      case 'DESCRIPTION':
        cur.description = unescape(value);
        break;
    }
  }
  return events;
}

function parseDate(value: string): string {
  // 20260115 oder 20260115T100000Z
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return value;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function unescape(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/**
 * Generiert einen iCal-Feed aus einer Liste von Buchungen, für Push an
 * Booking.com / Airbnb / Expedia (sie ziehen den Feed periodisch).
 */
export function buildICal(opts: {
  prodId: string;
  events: Array<{ uid: string; start: string; end: string; summary: string; description?: string }>;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${opts.prodId}//EN`,
    'CALSCALE:GREGORIAN',
  ];
  for (const e of opts.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTART;VALUE=DATE:${e.start.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${e.end.replace(/-/g, '')}`,
      `SUMMARY:${escapeIcal(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${escapeIcal(e.description)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function escapeIcal(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}
