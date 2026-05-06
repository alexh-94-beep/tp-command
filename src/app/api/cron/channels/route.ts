import { NextResponse, type NextRequest } from 'next/server';
import { syncAllChannels } from '@/services/channels/sync-ical';
import { syncAllChannelPools } from '@/services/channels/sync-pool';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Schutz: korrektes Secret in einem von drei Wegen
  //   1. Vercel Cron:        Authorization: Bearer <CRON_SECRET>
  //   2. Manueller Trigger:  x-cron-secret Header
  //   3. Browser/curl Test:  ?secret=<CRON_SECRET>
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET nicht gesetzt' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const headerSecret = request.headers.get('x-cron-secret');
  const querySecret = request.nextUrl.searchParams.get('secret');
  const valid = bearerSecret === secret || headerSecret === secret || querySecret === secret;
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const [direct, pool] = await Promise.all([syncAllChannels(), syncAllChannelPools()]);
    logger.info('cron channels-sync', {
      direct_runs: direct.length,
      pool_runs: pool.length,
      direct_inserted: direct.reduce((s, r) => s + r.inserted, 0),
      pool_inserted: pool.reduce((s, r) => s + r.inserted, 0),
    });
    return NextResponse.json({ ok: true, direct, pool });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
