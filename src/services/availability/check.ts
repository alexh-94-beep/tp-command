import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';

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
 * Validiert einen Datumsbereich [start, end) – pure helper, gut testbar.
 * Auszug exklusiv: eine bestehende Buchung 01.05.–10.05. blockiert NICHT
 * den Tag 10.05.
 */
export function validateAvailabilityRange(
  startDate: string,
  endDate: string,
): { valid: boolean; reason?: string } {
  if (endDate <= startDate) {
    return { valid: false, reason: 'Auszug muss nach dem Einzug liegen.' };
  }
  return { valid: true };
}

/**
 * Prüft, ob ein Datumsbereich für eine Wohnung frei ist.
 * Berücksichtigt aktive/geplante Buchungen und Blocks.
 *
 * Per ARCHITECTURE.md bekommt der Service den Supabase-Client als Parameter
 * (testbar, Caller entscheidet ueber server/service/anon-Kontext).
 */
export async function checkAvailability(
  supabase: SupabaseClient<Database>,
  opts: {
    apartmentId: string;
    startDate: string;
    endDate: string;
    ignoreBookingId?: string;
  },
): Promise<AvailabilityResult> {
  const { apartmentId, startDate, endDate, ignoreBookingId } = opts;

  const rangeCheck = validateAvailabilityRange(startDate, endDate);
  if (!rangeCheck.valid) {
    return {
      available: false,
      conflicts: [
        {
          type: 'booking',
          id: 'invalid_range',
          start_date: startDate,
          end_date: endDate,
          label: rangeCheck.reason!,
        },
      ],
    };
  }

  // Buchungen, die sich überschneiden könnten:
  //   booking.start < target.end  AND booking.end > target.start
  let bookingsQuery = supabase
    .from('bookings')
    .select(
      'id, start_date, end_date, status, tenant_id, rental_type, tenants!bookings_tenant_id_fkey(first_name, last_name)',
    )
    .eq('apartment_id', apartmentId)
    .in('status', ['planned', 'active'])
    .lt('start_date', endDate)
    .gt('end_date', startDate);

  if (ignoreBookingId) bookingsQuery = bookingsQuery.neq('id', ignoreBookingId);

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
    const t = b.tenants;
    const tenantName = t ? `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() : '';
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
