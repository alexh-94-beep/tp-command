import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { generateMonthlyRentPayments } from '@/services/payments/generate';

/**
 * Erzeugt monatliche Miet-Zahlungen fuer alle aktiven Langzeit-Buchungen.
 *
 * Geplant via vercel.json: jeden Tag 06:05 UTC. Der Service selbst ist
 * idempotent — gleiche (booking_id, type=rent, due_date) wird nie doppelt
 * erzeugt, daher unproblematisch wenn der Cron oefter laeuft als noetig.
 *
 * Auth: Bearer CRON_SECRET. Service-Role-Client (bypasst RLS, damit ueber
 * alle Buchungen iteriert werden kann).
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization');
  if (!expected || provided !== `Bearer ${expected}`) {
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
    const result = await generateMonthlyRentPayments(supabase);
    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron/generate-monthly-rent]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
