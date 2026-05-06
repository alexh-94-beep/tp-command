'use server';

import { requireRole } from '@/lib/auth/session';
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
  return findAvailableApartments(opts);
}
