/**
 * Auto-Auffrischungs-Reinigung bei langer Leerstand vor Einzug.
 *
 * Sitzungs-Wunsch: wenn eine Wohnung > 7 Tage nach der letzten Reinigung
 * leer stand und ein neuer Einzug bevorsteht, automatisch eine Auffrischung
 * planen. Bei > 14 Tagen eine etwas laengere Tiefenreinigung.
 *
 * Pure helper `decideRefreshCleaning` ist getrennt damit ueber Vitest
 * verifizierbar. Service `ensureRefreshCleaningForBooking` ruft sie auf
 * und legt den Cleaning-Task an (idempotent — nicht mehrfach pro Buchung).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { addDaysIso, todayIso } from '@/lib/dates';

// ── Pure helper (testbar) ──────────────────────────────────────────────

export interface RefreshDecision {
  /** Cleaning-Typ — pre_checkin = leicht, deep_clean = tief */
  type: 'pre_checkin' | 'deep_clean';
  /** Wieviele Tage vor Einzug der Auftrag fallen soll */
  daysBeforeMoveIn: number;
  /** Geschaetzte Dauer in Minuten (richtwert) */
  minutes: number;
  /** Begruendung, geht ins notes-Feld */
  reason: string;
}

/**
 * Entscheidet, ob/wie eine Auffrischung noetig ist.
 *
 * @param lastCleanedIso ISO-Datum der letzten Reinigung (oder null, wenn nie)
 * @param moveInIso      ISO-Datum des geplanten Einzugs
 * @param todayIsoStr    Heute (injectable fuer Tests)
 *
 * Regeln:
 *   - moveInIso liegt in der Vergangenheit → null (nichts mehr zu planen)
 *   - lastCleanedIso unbekannt UND moveInIso > 7 Tage entfernt → pre_checkin
 *   - Tage seit letzter Reinigung bis Einzug > 14 → deep_clean
 *   - > 7 → pre_checkin
 *   - sonst → null
 */
export function decideRefreshCleaning(
  lastCleanedIso: string | null,
  moveInIso: string,
  todayIsoStr: string,
): RefreshDecision | null {
  if (moveInIso < todayIsoStr) return null;
  // Wenn nie gereinigt UND Einzug in Zukunft → wie ">14 Tage", aber wir
  // wollen nicht uebertreiben — wir nehmen den pre_checkin-Pfad und
  // verlassen uns auf die manuelle Kontrolle durch Mireme.
  if (!lastCleanedIso) {
    return {
      type: 'pre_checkin',
      daysBeforeMoveIn: 1,
      minutes: 60,
      reason: 'Keine vorherige Reinigung dokumentiert — Auffrischung vor Einzug.',
    };
  }
  const daysSinceClean = daysBetween(lastCleanedIso, moveInIso);
  if (daysSinceClean > 14) {
    return {
      type: 'deep_clean',
      daysBeforeMoveIn: 2,
      minutes: 120,
      reason: `Wohnung stand ${daysSinceClean} Tage leer (> 14) — Tiefenreinigung.`,
    };
  }
  if (daysSinceClean > 7) {
    return {
      type: 'pre_checkin',
      daysBeforeMoveIn: 1,
      minutes: 60,
      reason: `Wohnung stand ${daysSinceClean} Tage leer (> 7) — Auffrischung.`,
    };
  }
  return null;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T00:00:00Z').getTime();
  const b = new Date(bIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86_400_000);
}

// ── Service ────────────────────────────────────────────────────────────

/**
 * Plant eine Auffrischungs-Reinigung fuer eine Buchung, falls noetig.
 *
 * - Nimmt nur Lang-/Kurzzeit-Buchungen (booking hat eigene Logik via
 *   ensureCheckoutCleaningForBooking)
 * - Schaut die letzte abgeschlossene/geplante Reinigung der Wohnung an
 * - Legt einen Task nur an, wenn noch keiner mit source='auto_refresh'
 *   fuer diese Buchung existiert
 */
export async function ensureRefreshCleaningForBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<{ created: boolean; reason?: string; error?: string }> {
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, apartment_id, rental_type, start_date, status')
    .eq('id', bookingId)
    .single();
  if (bErr || !booking) return { created: false, error: bErr?.message };
  if (!booking.apartment_id) return { created: false };
  if (booking.rental_type === 'booking') return { created: false }; // Booking hat eigene Logik
  if (booking.status === 'cancelled') return { created: false };

  const today = todayIso();
  if (booking.start_date < today) return { created: false }; // bereits eingezogen

  // Letzte Reinigung der Wohnung (egal welcher Status) — nehmen das
  // jüngste scheduled_date als Referenz fuer "wie lange leer".
  const { data: lastClean } = await supabase
    .from('cleaning_tasks')
    .select('scheduled_date, status, completed_at')
    .eq('apartment_id', booking.apartment_id)
    .neq('status', 'cancelled')
    .lte('scheduled_date', booking.start_date)
    .order('scheduled_date', { ascending: false })
    .limit(1);

  const lastCleanedIso = lastClean?.[0]?.scheduled_date ?? null;
  const decision = decideRefreshCleaning(lastCleanedIso, booking.start_date, today);
  if (!decision) return { created: false };

  // Idempotenz: existiert bereits ein auto_refresh-Task fuer diese Buchung?
  const { data: existing } = await supabase
    .from('cleaning_tasks')
    .select('id')
    .eq('apartment_id', booking.apartment_id)
    .eq('source', 'auto_refresh')
    .eq('scheduled_date', addDaysIso(booking.start_date, -decision.daysBeforeMoveIn))
    .neq('status', 'cancelled')
    .limit(1);
  if (existing && existing.length > 0) return { created: false };

  const scheduledDate = addDaysIso(booking.start_date, -decision.daysBeforeMoveIn);
  const { error: insErr } = await supabase.from('cleaning_tasks').insert({
    apartment_id: booking.apartment_id,
    scheduled_date: scheduledDate,
    type: decision.type,
    priority: 'normal',
    status: 'open',
    estimated_duration_minutes: decision.minutes,
    notes: decision.reason,
    source: 'auto_refresh',
    time_flexible: true,
  });
  if (insErr) return { created: false, error: insErr.message };

  return { created: true, reason: decision.reason };
}
