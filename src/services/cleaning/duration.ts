/**
 * Schätzt die Reinigungs-Dauer in Minuten basierend auf:
 *   - Quelle (Booking / Cityus / Eigene)
 *   - Wohnungstyp (Junior / Senior)
 *   - Reinigungstyp (weekly_clean / weekly_clean_linen / checkout / pre_checkin / inspection / ...)
 *
 * Speed-Faktor pro Person wird beim Anwenden separat multipliziert (siehe applySpeedFactor).
 */

export type CleaningSource = 'booking' | 'cityus' | 'own';

const DURATIONS: Record<CleaningSource, Record<string, Record<string, number>>> = {
  booking: {
    senior: {
      checkout: 75,           // 1.25h
      pre_checkin: 30,
      inspection: 15,
    },
    junior: {
      checkout: 60,
      pre_checkin: 30,
      inspection: 15,
    },
  },
  cityus: {
    senior: {
      weekly_clean: 60,
      weekly_clean_linen: 75,
      checkout: 120,
      pre_checkin: 30,
      inspection: 15,
    },
    junior: {
      weekly_clean: 45,
      weekly_clean_linen: 60,
      checkout: 120,
      pre_checkin: 30,
      inspection: 15,
    },
  },
  own: {
    senior: {
      weekly_clean: 60,
      weekly_clean_linen: 75,
      checkout: 180,
      pre_checkin: 45,
      inspection: 15,
      special: 60,
      deep_clean: 240,
      intermediate: 60,
    },
    junior: {
      weekly_clean: 45,
      weekly_clean_linen: 60,
      checkout: 150,
      pre_checkin: 30,
      inspection: 15,
      special: 45,
      deep_clean: 180,
      intermediate: 45,
    },
  },
};

/**
 * Liefert die geschätzte Dauer (Minuten) für die Kombination.
 * Fällt zurück auf 60 Minuten, wenn keine Regel passt.
 */
export function estimateDurationMinutes(
  source: CleaningSource,
  apartmentType: string,
  taskType: string,
): number {
  const aptKey = apartmentType === 'junior' ? 'junior' : 'senior';
  return DURATIONS[source]?.[aptKey]?.[taskType] ?? 60;
}

/**
 * Wendet den Speed-Faktor einer Person auf eine geplante Dauer an.
 * Speed-Faktor < 1 = schneller (Duo Sevdale + Bidet = 0.5 = doppelte Geschwindigkeit)
 */
export function applySpeedFactor(estimatedMinutes: number, speedFactor: number): number {
  return Math.round(estimatedMinutes * speedFactor);
}

/**
 * Erkennt aus den Notizen / Type, ob es ein Wechsel der Bettwäsche ist.
 * Cityus liefert das im daily plan – wir konvertieren weekly_clean → weekly_clean_linen.
 */
export function isLinenChange(taskType: string, notes: string | null): boolean {
  if (taskType === 'weekly_clean_linen') return true;
  if (!notes) return false;
  return /linen|bettwäsche|bettwaesche/i.test(notes);
}
