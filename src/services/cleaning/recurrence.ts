/**
 * Phase 26d: Wiederkehr-Serien fuer Reinigungen.
 *
 * Pure Helpers für die Datums-Mathematik. Service-Layer (DB-Calls) ist
 * in apply-recurrence.ts.
 */

import { addDaysIso, OPEN_END_DATE } from '@/lib/dates';

export type CleaningRecurrence = 'none' | 'weekly' | 'biweekly' | 'monthly';

/**
 * Verschiebt ein Sa/So-Datum auf den naechsten Werktag.
 *  - Samstag → Freitag (-1)
 *  - Sonntag → Montag (+1)
 *  - Mo–Fr → unveraendert
 *
 * Verwendet bei der automatischen Generation. Manuelles Drag&Drop kann
 * spaeter zurueck aufs Wochenende ziehen.
 */
export function shiftFromWeekend(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay(); // 0 = So, 6 = Sa
  if (day === 6) return addDaysIso(iso, -1); // Sa → Fr
  if (day === 0) return addDaysIso(iso, 1); // So → Mo
  return iso;
}

/**
 * Default-Horizont fuer rollierende open-ended Buchungen: 3 Monate ab heute.
 * Pure Funktion, nimmt eine Referenz-"heute"-Datum entgegen (testbar).
 */
export function defaultRecurrenceHorizon(todayIso: string): string {
  const d = new Date(todayIso);
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

/**
 * Berechnet die Liste aller Termine einer Reinigungs-Serie.
 *
 *  - startDate: Buchungs-Einzug (Reinigungen starten ab startDate + Schritt)
 *  - endDate: Auszug-Datum oder OPEN_END_DATE → in dem Fall rollierend
 *    bis `horizonDate` (Default: heute + 3 Monate).
 *  - recurrence: 'weekly' = +7 Tage, 'biweekly' = +14, 'monthly' = +1 Monat
 *  - shiftWeekend: Sa→Fr, So→Mo (default true)
 *
 * Returns sortierte Liste von ISO-Daten. Leere Liste wenn recurrence='none'
 * oder horizon vor startDate.
 */
export function computeRecurrenceDates(input: {
  startDate: string;
  endDate: string;
  recurrence: CleaningRecurrence;
  horizonDate: string;
  shiftWeekend?: boolean;
}): string[] {
  if (input.recurrence === 'none') return [];
  const shift = input.shiftWeekend ?? true;
  // Effektives End-Datum: bei open-ended → horizonDate, sonst min(endDate, horizonDate)
  const effectiveEnd =
    input.endDate === OPEN_END_DATE || input.endDate > input.horizonDate
      ? input.horizonDate
      : input.endDate;

  const result: string[] = [];
  let next = stepForward(input.startDate, input.recurrence);
  let safety = 0; // Schutz gegen Endlos-Loop
  while (next <= effectiveEnd && safety < 1000) {
    safety += 1;
    result.push(shift ? shiftFromWeekend(next) : next);
    next = stepForward(next, input.recurrence);
  }
  // Duplikate entfernen (kann durch Weekend-Shift entstehen)
  return [...new Set(result)].sort();
}

function stepForward(iso: string, rec: CleaningRecurrence): string {
  if (rec === 'weekly') return addDaysIso(iso, 7);
  if (rec === 'biweekly') return addDaysIso(iso, 14);
  if (rec === 'monthly') {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
  return iso;
}

/**
 * Mapping: recurrence + linen-flag → konkreter cleaning_type.
 */
export function recurrenceCleaningType(
  recurrence: CleaningRecurrence,
  linen: boolean,
): 'weekly_clean' | 'weekly_clean_linen' | 'biweekly_clean' | 'biweekly_clean_linen' | 'monthly_clean' | 'monthly_clean_linen' | null {
  if (recurrence === 'none') return null;
  if (recurrence === 'weekly') return linen ? 'weekly_clean_linen' : 'weekly_clean';
  if (recurrence === 'biweekly')
    return linen ? 'biweekly_clean_linen' : 'biweekly_clean';
  return linen ? 'monthly_clean_linen' : 'monthly_clean';
}
