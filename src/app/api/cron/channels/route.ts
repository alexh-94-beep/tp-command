import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedCron } from '@/lib/auth/cron';

/**
 * Täglicher Channel-iCal-Sync (Booking.com u. a.).
 * Geplant via Vercel-Cron (vercel.json) um 06:00 UTC.
 * Schutz: Vercel sendet `Authorization: Bearer <CRON_SECRET>`.
 *
 * Phase 0: Platzhalter. Die eigentliche Pull-Logik kommt in Phase 6
 * (iCal-Pull pro Wohnung) und nutzt dann den Service-Role-Client.
 */
export function GET(request: NextRequest) {
  if (
    !isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)
  ) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, synced: 0, note: 'Phase-0-Platzhalter' });
}
