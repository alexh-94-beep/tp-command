'use server';

import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  findAvailableApartments,
  type ApartmentAvailability,
} from '@/services/availability/find';

export async function listApartmentsForBooking(opts: {
  startDate: string;
  endDate?: string;
  ignoreBookingId?: string;
}): Promise<ApartmentAvailability[]> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  return findAvailableApartments(supabase, opts);
}
