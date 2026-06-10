/**
 * Dashboard-Kennzahlen fuer die Startseite.
 *
 * Service-Funktion `getDashboardMetrics(supabase, today?)` aggregiert alle
 * Zaehler in EINEM Aufruf — damit das Dashboard nicht in N+1 Requests rennt.
 * Heute-Datum ist injectable, damit Tests deterministisch sind.
 *
 * Sortier-Logik und Status-Buckets sind als Pure-Helper extrahiert und
 * separat getestet.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { todayIso, addDaysIso, OPEN_END_DATE } from '@/lib/dates';

// ── Pure helpers ───────────────────────────────────────────────────────

/** True, wenn ein Datum vor heute liegt (ISO YYYY-MM-DD String-Compare ok). */
export function isOverdue(dueDateIso: string, todayIsoStr: string): boolean {
  return dueDateIso < todayIsoStr;
}

/**
 * Auslastung in % fuer einen Datumsbereich [from, to).
 * - apartmentDays = Anzahl Wohnungen * Tage im Range
 * - occupiedDays  = Summe der belegten Tage aller aktiven/geplanten Buchungen,
 *                   die in den Range fallen
 * Open-end-Buchungen (end_date = OPEN_END_DATE) zaehlen bis `to`.
 */
export function occupancyPercent(
  apartmentCount: number,
  rangeFromIso: string,
  rangeToIso: string,
  bookings: Array<{ start_date: string; end_date: string }>,
): number {
  if (apartmentCount === 0) return 0;
  const rangeFrom = new Date(rangeFromIso).getTime();
  const rangeTo = new Date(rangeToIso).getTime();
  if (rangeTo <= rangeFrom) return 0;
  const rangeDays = Math.round((rangeTo - rangeFrom) / 86_400_000);
  const apartmentDays = apartmentCount * rangeDays;

  let occupiedDays = 0;
  for (const b of bookings) {
    const start = Math.max(new Date(b.start_date).getTime(), rangeFrom);
    const endIso = b.end_date === OPEN_END_DATE ? rangeToIso : b.end_date;
    const end = Math.min(new Date(endIso).getTime(), rangeTo);
    if (end > start) {
      occupiedDays += Math.round((end - start) / 86_400_000);
    }
  }
  return Math.round((occupiedDays / apartmentDays) * 100);
}

/** Erster Tag des aktuellen Monats (ISO). */
export function startOfMonthIso(todayIsoStr: string): string {
  return todayIsoStr.slice(0, 8) + '01';
}

/** Erster Tag des Folgemonats (exklusiv-Range). */
export function startOfNextMonthIso(todayIsoStr: string): string {
  const [y, m] = todayIsoStr.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

// ── Public types ───────────────────────────────────────────────────────

export interface DashboardMetrics {
  today: string;
  apartments: {
    total: number;
    occupied: number;
    free: number;
  };
  movements: {
    checkInsToday: number;
    checkOutsToday: number;
    checkInsNext7: number;
    checkOutsNext7: number;
  };
  cleanings: {
    openToday: number;
    openWeek: number;
    overdue: number;
  };
  pool: {
    pending: number;
  };
  tasks: {
    overdue: number;
    dueToday: number;
  };
  payments: {
    openCount: number;
    openSum: number;
    overdueCount: number;
    overdueSum: number;
  };
  occupancy: {
    monthPercent: number;
    monthLabel: string; // z.B. "Juni 2026"
  };
}

// ── DB-Orchestrator ────────────────────────────────────────────────────

export async function getDashboardMetrics(
  supabase: SupabaseClient<Database>,
  today: string = todayIso(),
): Promise<DashboardMetrics> {
  const next7 = addDaysIso(today, 7);
  const monthStart = startOfMonthIso(today);
  const monthEnd = startOfNextMonthIso(today);

  const [
    apartments,
    occupiedBookings,
    monthBookings,
    inToday,
    outToday,
    inWeek,
    outWeek,
    cleanOpenToday,
    cleanOpenWeek,
    cleanOverdue,
    poolPending,
    tasksOverdue,
    tasksDueToday,
    openPayments,
  ] = await Promise.all([
    // 1. Wohnungen total (ohne ausgeschiedene)
    supabase
      .from('apartments')
      .select('*', { count: 'exact', head: true })
      .neq('ownership', 'sold_external'),
    // 2. Aktuell belegte Buchungen (start <= heute < end)
    supabase
      .from('bookings')
      .select('apartment_id, start_date, end_date')
      .in('status', ['planned', 'active'])
      .lte('start_date', today)
      .gt('end_date', today),
    // 3. Buchungen, die in den aktuellen Monat reinfallen (Auslastungsberechnung)
    supabase
      .from('bookings')
      .select('start_date, end_date')
      .in('status', ['planned', 'active'])
      .lt('start_date', monthEnd)
      .gt('end_date', monthStart),
    // 4. Heute Einzug
    supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .in('status', ['planned', 'active'])
      .eq('start_date', today),
    // 5. Heute Auszug
    supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .in('status', ['planned', 'active'])
      .eq('end_date', today),
    // 6. Einzug naechste 7 Tage (ohne heute)
    supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .in('status', ['planned', 'active'])
      .gt('start_date', today)
      .lte('start_date', next7),
    // 7. Auszug naechste 7 Tage (ohne heute, ohne open-end)
    supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .in('status', ['planned', 'active'])
      .gt('end_date', today)
      .lte('end_date', next7)
      .neq('end_date', OPEN_END_DATE),
    // 8. Offene Reinigungen heute
    supabase
      .from('cleaning_tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress'])
      .eq('scheduled_date', today),
    // 9. Offene Reinigungen diese Woche (heute + 6 weitere Tage)
    supabase
      .from('cleaning_tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress'])
      .gte('scheduled_date', today)
      .lte('scheduled_date', next7),
    // 10. Ueberfaellige Reinigungen (scheduled < heute, noch offen)
    supabase
      .from('cleaning_tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress'])
      .lt('scheduled_date', today),
    // 11. Offene Pool-Reservationen (Phase 6)
    supabase
      .from('pending_reservations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    // 12. Ueberfaellige Workflow-Tasks (due_date < heute, nicht erledigt/skipped)
    supabase
      .from('booking_tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress'])
      .lt('due_date', today),
    // 13. Workflow-Tasks heute faellig
    supabase
      .from('booking_tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress'])
      .eq('due_date', today),
    // 14. Offene + ueberfaellige Zahlungen (Summe wird clientseitig gerechnet)
    supabase
      .from('payments')
      .select('amount, status')
      .in('status', ['pending', 'overdue']),
  ]);


  const total = apartments.count ?? 0;
  // occupied = distinct apartment_ids aus occupiedBookings
  const occupiedSet = new Set((occupiedBookings.data ?? []).map((b) => b.apartment_id));
  const occupied = occupiedSet.size;

  // Zahlungen aggregieren (Phase 8): kein DB-side SUM, weil PostgREST das
  // ungemuetlich macht; bei wenigen offenen Zahlungen ist clientseitig ok.
  const paymentRows = openPayments.data ?? [];
  let openCount = 0;
  let openSum = 0;
  let overdueCount = 0;
  let overdueSum = 0;
  for (const p of paymentRows) {
    const amt = Number(p.amount);
    openCount++;
    openSum += amt;
    if (p.status === 'overdue') {
      overdueCount++;
      overdueSum += amt;
    }
  }
  const paymentsAgg = { openCount, openSum, overdueCount, overdueSum };

  const monthPercent = occupancyPercent(
    total,
    monthStart,
    monthEnd,
    monthBookings.data ?? [],
  );

  // Monatslabel: "Juni 2026" (de)
  const monthLabel = new Date(monthStart + 'T00:00:00Z').toLocaleDateString('de-CH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return {
    today,
    apartments: {
      total,
      occupied,
      free: Math.max(0, total - occupied),
    },
    movements: {
      checkInsToday: inToday.count ?? 0,
      checkOutsToday: outToday.count ?? 0,
      checkInsNext7: inWeek.count ?? 0,
      checkOutsNext7: outWeek.count ?? 0,
    },
    cleanings: {
      openToday: cleanOpenToday.count ?? 0,
      openWeek: cleanOpenWeek.count ?? 0,
      overdue: cleanOverdue.count ?? 0,
    },
    pool: {
      pending: poolPending.count ?? 0,
    },
    tasks: {
      overdue: tasksOverdue.count ?? 0,
      dueToday: tasksDueToday.count ?? 0,
    },
    payments: paymentsAgg,
    occupancy: {
      monthPercent,
      monthLabel,
    },
  };
}
