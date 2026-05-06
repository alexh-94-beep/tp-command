/**
 * Auto-Zuweisungs-Logik für Pool-Reservationen.
 *
 * Reihenfolge der Vorschläge (besser → schlechter):
 *   1. Wohnung ist "nur für Booking" reserviert (allowed_rental_types == ['booking']) → Pool-Default
 *   2. booking_priority DESC
 *   3. Geringster resultierender Leerstand vorher/nachher (Tetris)
 */
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { dayDiff } from '@/lib/dates';

export interface ApartmentSuggestion {
  apartment_id: string;
  number: string;
  building: string;
  type: string;
  is_pool_default: boolean;
  booking_priority: number;
  gap_before_days: number | null;   // Leerstand vor unserer neuen Buchung (0 = direkt anschliessend)
  gap_after_days: number | null;    // Leerstand danach
  total_gap: number;                // Summe für Sortierung (kleiner = besser)
  available: boolean;
  reason?: string;
}

export interface SuggestionsResult {
  reservation: {
    id: string;
    start_date: string;
    end_date: string;
    summary: string | null;
  };
  suggestions: ApartmentSuggestion[];
}

export async function suggestApartmentsForReservation(reservationId: string): Promise<SuggestionsResult | null> {
  const supabase = createSupabaseServerClient();

  const { data: res } = await supabase
    .from('pending_reservations')
    .select('id, start_date, end_date, summary')
    .eq('id', reservationId)
    .single();
  if (!res) return null;

  // Wohnungen mit 'booking' in allowed_rental_types und im Bestand
  const { data: apartments } = await supabase
    .from('apartments')
    .select(
      'id, number, building, type, allowed_rental_types, booking_priority, cleaning_buffer_hours, ownership',
    )
    .neq('ownership', 'sold_external')
    .contains('allowed_rental_types', ['booking'])
    .order('booking_priority', { ascending: false });

  // Bookings & blocks im weiteren Umkreis laden, um gap_before/gap_after zu berechnen
  const widenStart = subDaysIso(res.start_date, 90);
  const widenEnd = addDaysIso(res.end_date, 90);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('apartment_id, start_date, end_date, status')
    .in('status', ['planned', 'active'])
    .lt('start_date', widenEnd)
    .gt('end_date', widenStart);

  const { data: blocks } = await supabase
    .from('blocks')
    .select('apartment_id, start_date, end_date')
    .lt('start_date', widenEnd)
    .gt('end_date', widenStart);

  const occByApt = new Map<string, Array<{ start: string; end: string }>>();
  for (const b of bookings ?? []) {
    const arr = occByApt.get(b.apartment_id) ?? [];
    arr.push({ start: b.start_date, end: b.end_date });
    occByApt.set(b.apartment_id, arr);
  }
  for (const bl of blocks ?? []) {
    const arr = occByApt.get(bl.apartment_id) ?? [];
    arr.push({ start: bl.start_date, end: bl.end_date });
    occByApt.set(bl.apartment_id, arr);
  }

  const suggestions: ApartmentSuggestion[] = (apartments ?? []).map((a) => {
    const occ = occByApt.get(a.id) ?? [];
    // Verfügbarkeit: keine Überlappung mit unserem Zeitraum
    const overlap = occ.find((o) => o.start < res.end_date && o.end > res.start_date);
    const isAvailable = !overlap;

    // gap_before: Tage zwischen letztem Auszug vor uns und unserem Einzug
    const before = occ
      .filter((o) => o.end <= res.start_date)
      .sort((x, y) => x.end.localeCompare(y.end))
      .pop();
    const gapBefore = before ? dayDiff(before.end, res.start_date) : null;

    // gap_after: Tage zwischen unserem Auszug und nächstem Einzug
    const after = occ
      .filter((o) => o.start >= res.end_date)
      .sort((x, y) => x.start.localeCompare(y.start))[0];
    const gapAfter = after ? dayDiff(res.end_date, after.start) : null;

    // Total gap = gap_before + gap_after, "open-ended" zählt nicht
    const total =
      (gapBefore ?? 999) + (gapAfter ?? 999); // grosse Zahl wenn keine Nachbarbuchung → unwichtig

    return {
      apartment_id: a.id,
      number: a.number,
      building: a.building,
      type: a.type,
      is_pool_default: a.allowed_rental_types.length === 1 && a.allowed_rental_types[0] === 'booking',
      booking_priority: a.booking_priority,
      gap_before_days: gapBefore,
      gap_after_days: gapAfter,
      total_gap: total,
      available: isAvailable,
      reason: overlap ? `belegt von ${overlap.start} bis ${overlap.end}` : undefined,
    };
  });

  // Sortieren: erst nur verfügbare, dann pool_default zuerst, dann booking_priority desc, dann total_gap asc
  suggestions.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (a.is_pool_default !== b.is_pool_default) return a.is_pool_default ? -1 : 1;
    if (b.booking_priority !== a.booking_priority) return b.booking_priority - a.booking_priority;
    return a.total_gap - b.total_gap;
  });

  return {
    reservation: {
      id: res.id,
      start_date: res.start_date,
      end_date: res.end_date,
      summary: res.summary,
    },
    suggestions,
  };
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function subDaysIso(iso: string, n: number): string {
  return addDaysIso(iso, -n);
}
