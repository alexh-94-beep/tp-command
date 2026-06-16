import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { generateUpcomingDrafts } from '@/services/communications/generate-drafts';
import { isAuthorizedCron } from '@/lib/auth/cron';

/**
 * Taeglicher Cron: erzeugt Mail-Drafts fuer anstehende Buchungs-Ereignisse
 * (Welcome, Checkin, Checkout) und ueberfaellige Zahlungen
 * (Payment-Reminder).
 *
 * Annahme #22: kein Auto-Versand. Drafts werden nur erzeugt, Office sieht
 * sie in der Buchungs-Detail-Sektion und sendet mit einem Klick.
 *
 * Geplant via vercel.json: taeglich 06:10 UTC (08:10 CEST).
 * Auth: Bearer CRON_SECRET. Service-Role-Client (bypasst RLS).
 */
export async function GET(request: NextRequest) {
  if (
    !isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)
  ) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: 'missing supabase env' },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const result = await generateUpcomingDrafts(supabase);
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron/generate-mail-drafts]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
