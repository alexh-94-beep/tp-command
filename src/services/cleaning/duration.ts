/**
 * Schaetzt die Reinigungs-Dauer in Minuten basierend auf:
 *   - Quelle (Booking / Cityus / Eigene)
 *   - Wohnungstyp (Junior / Senior)
 *   - Reinigungstyp (weekly_clean / checkout / pre_checkin / inspection / ...)
 *
 * Speed-Faktor pro Person wird separat ueber applySpeedFactor multipliziert.
 * Komplett pure — gut testbar, kein DB-Zugriff.
 */

export type CleaningSource = 'booking' | 'cityus' | 'own';

const DURATIONS: Record<CleaningSource, Record<string, Record<string, number>>> = {
  booking: {
    senior: { checkout: 75, pre_checkin: 30, inspection: 15 },
    junior: { checkout: 60, pre_checkin: 30, inspection: 15 },
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

/** Geschaetzte Dauer (Minuten). Fallback 60 wenn keine Regel passt. */
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
 * Speed-Faktor < 1 = schneller (Duo Sevdale + Bidet = 0.5 = doppelte Geschw.).
 */
export function applySpeedFactor(estimatedMinutes: number, speedFactor: number): number {
  return Math.round(estimatedMinutes * speedFactor);
}

/** Erkennt aus Notizen, ob es ein Bettwaesche-Wechsel ist. */
export function isLinenChange(taskType: string, notes: string | null): boolean {
  if (taskType === 'weekly_clean_linen') return true;
  if (!notes) return false;
  return /linen|bettwäsche|bettwaesche/i.test(notes);
}
