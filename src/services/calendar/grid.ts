import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  start_date: string; // ISO
  end_date: string;   // ISO
  title: string;
  status: string;     // für Farbe
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
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;
  building?: string;
  type?: string;
  rentalType?: 'long_term' | 'short_term' | 'booking';
  includeSoldExternal?: boolean;
}

export async function getCalendarData(filters: CalendarFilters): Promise<CalendarData> {
  const supabase = createSupabaseServerClient();

  // Wohnungen filtern
  let aptQuery = supabase
    .from('apartments')
    .select(
      'id, number, building, type, status, current_tenant_label, current_move_in, current_move_out, ownership',
    )
    .order('number');
  if (!filters.includeSoldExternal) aptQuery = aptQuery.neq('ownership', 'sold_external');
  if (filters.building) aptQuery = aptQuery.eq('building', filters.building);
  if (filters.type) aptQuery = aptQuery.eq('type', filters.type);

  const { data: apartments } = await aptQuery;
  const apartmentList = (apartments ?? []) as Array<CalendarApartment & {
    status: string;
    current_tenant_label: string | null;
    current_move_in: string | null;
    current_move_out: string | null;
  }>;
  const apartmentIds = apartmentList.map((a) => a.id);

  // Buchungen im Zeitraum
  let bookingsQuery = supabase
    .from('bookings')
    .select(
      'id, apartment_id, start_date, end_date, status, rental_type, tenants!bookings_tenant_id_fkey(first_name, last_name)',
    )
    .in('apartment_id', apartmentIds)
    .in('status', ['planned', 'active'])
    .lt('start_date', filters.endDate)
    .gt('end_date', filters.startDate);
  if (filters.rentalType) bookingsQuery = bookingsQuery.eq('rental_type', filters.rentalType);
  const { data: bookings } = await bookingsQuery;

  // Blocks
  const { data: blocks } = await supabase
    .from('blocks')
    .select('id, apartment_id, start_date, end_date, reason')
    .in('apartment_id', apartmentIds)
    .lt('start_date', filters.endDate)
    .gt('end_date', filters.startDate);

  const events: CalendarEvent[] = [];

  for (const b of bookings ?? []) {
    const t = b.tenants as { first_name?: string; last_name?: string } | null;
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
      href: undefined,
    });
  }

  // Spiegel-Daten aus Excel als zusätzliche Events
  for (const a of apartmentList) {
    if (
      !a.current_tenant_label &&
      !['occupied', 'terminated', 'contract_pending', 'booking_active'].includes(a.status)
    ) {
      continue;
    }

    // Mietart-Filter auf Spiegel: booking_active = Booking; sonst nehmen wir Langzeit an
    const inferredRentalType: 'long_term' | 'booking' =
      a.status === 'booking_active' ? 'booking' : 'long_term';
    if (filters.rentalType && filters.rentalType !== inferredRentalType) continue;

    const start = a.current_move_in ?? '0001-01-01';
    let end = a.current_move_out ?? '9999-12-31';
    if (a.current_move_in && a.current_move_out && end <= start) end = '9999-12-31';
    if (start >= filters.endDate || end <= filters.startDate) continue;

    events.push({
      id: `mirror-${a.id}`,
      apartment_id: a.id,
      kind: 'mirror',
      start_date: start,
      end_date: end,
      title: a.current_tenant_label ?? `(${a.status})`,
      status: a.status,
      rental_type: inferredRentalType,
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
