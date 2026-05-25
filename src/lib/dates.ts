import { format, parseISO } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { de } from 'date-fns/locale';

export const APP_TZ = process.env.APP_TIMEZONE ?? 'Europe/Zurich';

/** Wandelt ein Date oder ISO-String in lokale Schweizer Zeit um. */
export function toLocal(value: Date | string): Date {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return toZonedTime(d, APP_TZ);
}

/** Formatiert ein Datum kurz: 29.04.2026 */
export function formatDate(value: Date | string): string {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return formatInTimeZone(d, APP_TZ, 'dd.MM.yyyy', { locale: de });
}

/** Formatiert mit Wochentag: Mi, 29.04.2026 */
export function formatDateLong(value: Date | string): string {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return formatInTimeZone(d, APP_TZ, 'EEE, dd.MM.yyyy', { locale: de });
}

/** Formatiert Zeit: 14:30 */
export function formatTime(value: Date | string): string {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return formatInTimeZone(d, APP_TZ, 'HH:mm', { locale: de });
}

/** Heute als YYYY-MM-DD (für DB date-Spalten). */
export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Sentinel-Datum für unbefristete Buchungen (Langzeit ohne Auszug). */
export const OPEN_END_DATE = '9999-12-31';

/** Liste der Tage [start, end) als ISO YYYY-MM-DD. */
export function daysBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const d = new Date(startIso);
  const end = new Date(endIso);
  while (d < end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Differenz in Tagen zwischen zwei ISO-Daten (positiv wenn end > start). */
export function dayDiff(startIso: string, endIso: string): number {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  return Math.round((e - s) / 86_400_000);
}

/** ISO-Datum + n Tage */
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Liefert den Montag der Woche, in der das ISO-Datum liegt. */
export function mondayOfWeekIso(iso: string): string {
  const d = new Date(iso);
  const dow = d.getDay(); // 0 = Sonntag
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Wie formatDate, aber zeigt für die Sentinel "unbefristet". */
export function formatEndDate(value: string | Date | null): string {
  if (!value) return '–';
  const iso = typeof value === 'string' ? value.slice(0, 10) : format(value, 'yyyy-MM-dd');
  if (iso === OPEN_END_DATE) return 'unbefristet';
  return formatDate(value);
}
