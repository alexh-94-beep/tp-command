'use server';

import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkAvailability, type AvailabilityResult } from '@/services/availability/check';

export async function checkBookingAvailability(input: {
  apartmentId: string;
  startDate: string;
  endDate: string;
  ignoreBookingId?: string;
}): Promise<AvailabilityResult> {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();
  return checkAvailability(supabase, input);
}
