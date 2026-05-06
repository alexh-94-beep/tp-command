import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AvailabilityConflict {
  type: 'booking' | 'block';
  id: string;
  start_date: string;
  end_date: string;
  label: string;
}

export interface AvailabilityResult {
  available: boolean;
  conflicts: AvailabilityConflict[];
}

/**
 * Prüft, ob ein Datumsbereich für eine Wohnung frei ist.
 * Berücksichtigt aktive/geplante Buchungen und Blocks.
 *
 * Datumssemantik wie in der DB: start inklusiv, end exklusiv (`[start, end)`).
 * Eine bestehende Buchung 01.05.–10.05. blockiert NICHT den Tag 10.05.
 */
export async function checkAvailability(opts: {
  apartmentId: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  ignoreBookingId?: string;
}): Promise<AvailabilityResult> {
  const { apartmentId, startDate, endDate, ignoreBookingId } = opts;

  if (endDate <= startDate) {
    return {
      available: false,
      conflicts: [
        {
          type: 'booking',
          id: 'invalid_range',
          start_date: startDate,
          end_date: endDate,
          label: 'Auszug muss nach dem Einzug liegen.',
        },
      ],
    };
  }

  const supabase = createSupabaseServerClient();

  // Buchungen, die sich überschneiden könnten:
  //   booking.start < target.end  AND booking.end > target.start
  let bookingsQuery = supabase
    .from('bookings')
    .select('id, start_date, end_date, status, tenant_id, rental_type, tenants!bookings_tenant_id_fkey(first_name, last_name)')
    .eq('apartment_id', apartmentId)
    .in('status', ['planned', 'active'])
    .lt('start_date', endDate)
    .gt('end_date', startDate);

  if (ignoreBookingId) {
    bookingsQuery = bookingsQuery.neq('id', ignoreBookingId);
  }

  const { data: bookings, error: bookingsErr } = await bookingsQuery;
  if (bookingsErr) throw new Error(bookingsErr.message);

  const { data: blocks, error: blocksErr } = await supabase
    .from('blocks')
    .select('id, start_date, end_date, reason')
    .eq('apartment_id', apartmentId)
    .lt('start_date', endDate)
    .gt('end_date', startDate);

  if (blocksErr) throw new Error(blocksErr.message);

  const conflicts: AvailabilityConflict[] = [];

  for (const b of bookings ?? []) {
    const tenant = b.tenants as { first_name?: string; last_name?: string } | null;
    const tenantName = tenant ? `${tenant.first_name ?? ''} ${tenant.last_name ?? ''}`.trim() : '';
    conflicts.push({
      type: 'booking',
      id: b.id,
      start_date: b.start_date,
      end_date: b.end_date,
      label: `Buchung (${b.rental_type}) ${tenantName ? '· ' + tenantName : ''}`.trim(),
    });
  }

  for (const bl of blocks ?? []) {
    conflicts.push({
      type: 'block',
      id: bl.id,
      start_date: bl.start_date,
      end_date: bl.end_date,
      label: `Sperre: ${bl.reason ?? '–'}`,
    });
  }

  return { available: conflicts.length === 0, conflicts };
}
