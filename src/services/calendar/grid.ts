import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import type { ApartmentStatus } from '@/types/aliases';

export interface CalendarApartment {
  id: string;
  number: string;
  building: string;
  type: string;
}

export interface CalendarEvent {
  id: string;
  apartment_id: string;
  kind: 'booking' | 'block' | 'mirror';
  start_date: string;
  end_date: string;
  title: string;
  status: string;
  rental_type?: string;
  /** Link-Ziel (Buchungs-Detail oder Wohnungs-Detail bei Spiegel/Block) */
  href?: string;
}

export interface CalendarData {
  startDate: string;
  endDate: string;
  apartments: CalendarApartment[];
  events: CalendarEvent[];
}

export interface CalendarFilters {
  startDate: string;
  endDate: string;
  /** Multi-Select: 1..n Gebäude, leer/undefined = alle */
  buildings?: string[];
  types?: ('junior' | 'senior' | 'suite' | 'studio')[];
  rentalTypes?: ('long_term' | 'short_term' | 'booking')[];
  includeSoldExternal?: boolean;
}

// ── Pure helpers (testbar) ─────────────────────────────────────────────

/**
 * Inferiert die Mietart aus dem Spiegel-Status. booking_active → booking,
 * sonst long_term (occupied/terminated/contract_pending).
 */
export function inferMirrorRentalType(
  status: ApartmentStatus,
): 'long_term' | 'booking' {
  return status === 'booking_active' ? 'booking' : 'long_term';
}

/**
 * Berechnet Spiegel-Event-Zeitraum aus current_move_in/_out. Repariert
 * Datums-Inkonsistenzen (end <= start) zu open-end. Liefert null, wenn
 * die Wohnung keinen Spiegel hat (kein Label und Status nicht "belegt").
 */
export function computeMirrorRange(input: {
  status: ApartmentStatus;
  current_tenant_label: string | null;
  current_move_in: string | null;
  current_move_out: string | null;
}): { start: string; end: string } | null {
  const hasLabel = !!input.current_tenant_label;
  const occupiedLike =
    input.status === 'occupied' ||
    input.status === 'terminated' ||
    input.status === 'contract_pending' ||
    input.status === 'booking_active';
  if (!hasLabel && !occupiedLike) return null;

  const start = input.current_move_in ?? '0001-01-01';
  let end = input.current_move_out ?? '9999-12-31';
  if (input.current_move_in && input.current_move_out && end <= start) {
    end = '9999-12-31';
  }
  return { start, end };
}

// ── Service (DB-Orchestrator) ──────────────────────────────────────────

export async function getCalendarData(
  supabase: SupabaseClient<Database>,
  filters: CalendarFilters,
): Promise<CalendarData> {
  let aptQuery = supabase
    .from('apartments')
    .select(
      'id, number, building, type, status, current_tenant_label, current_move_in, current_move_out, ownership',
    )
    .order('number');
  if (!filters.includeSoldExternal) aptQuery = aptQuery.neq('ownership', 'sold_external');
  if (filters.buildings?.length) aptQuery = aptQuery.in('building', filters.buildings);
  if (filters.types?.length) aptQuery = aptQuery.in('type', filters.types);

  const { data: apartments } = await aptQuery;
  const apartmentList = apartments ?? [];
  const apartmentIds = apartmentList.map((a) => a.id);

  let bookingsQuery = supabase
    .from('bookings')
    .select(
      'id, apartment_id, start_date, end_date, status, rental_type, tenants!bookings_tenant_id_fkey(first_name, last_name)',
    )
    .in('apartment_id', apartmentIds)
    .in('status', ['planned', 'active'])
    .lt('start_date', filters.endDate)
    .gt('end_date', filters.startDate);
  if (filters.rentalTypes?.length)
    bookingsQuery = bookingsQuery.in('rental_type', filters.rentalTypes);
  const { data: bookings } = await bookingsQuery;

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id, apartment_id, start_date, end_date, reason')
    .in('apartment_id', apartmentIds)
    .lt('start_date', filters.endDate)
    .gt('end_date', filters.startDate);

  const events: CalendarEvent[] = [];

  for (const b of bookings ?? []) {
    const t = b.tenants;
    const name = t ? `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() : '';
    events.push({
      id: b.id,
      apartment_id: b.apartment_id,
      kind: 'booking',
      start_date: b.start_date,
      end_date: b.end_date,
      title: name || 'Buchung',
      status: b.status,
      rental_type: b.rental_type,
      href: `/bookings/${b.id}`,
    });
  }

  for (const bl of blocks ?? []) {
    events.push({
      id: bl.id,
      apartment_id: bl.apartment_id,
      kind: 'block',
      start_date: bl.start_date,
      end_date: bl.end_date,
      title: bl.reason ?? 'Sperre',
      status: 'block',
    });
  }

  // Spiegel-Daten (Excel-Bestand) als Pseudo-Events
  for (const a of apartmentList) {
    const range = computeMirrorRange({
      status: a.status,
      current_tenant_label: a.current_tenant_label,
      current_move_in: a.current_move_in,
      current_move_out: a.current_move_out,
    });
    if (!range) continue;
    const inferred = inferMirrorRentalType(a.status);
    if (filters.rentalTypes?.length && !filters.rentalTypes.includes(inferred)) continue;
    if (range.start >= filters.endDate || range.end <= filters.startDate) continue;

    events.push({
      id: `mirror-${a.id}`,
      apartment_id: a.id,
      kind: 'mirror',
      start_date: range.start,
      end_date: range.end,
      title: a.current_tenant_label ?? `(${a.status})`,
      status: a.status,
      rental_type: inferred,
      href: `/apartments/${a.id}`,
    });
  }

  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    apartments: apartmentList,
    events,
  };
}
