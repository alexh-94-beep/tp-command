import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';

/**
 * Markiert ueberfaellige Zahlungen taeglich als 'overdue'.
 *
 * Ruft die DB-Funktion `mark_overdue_payments()` auf — die setzt alle
 * pending payments mit due_date < CURRENT_DATE auf 'overdue' und triggert
 * pro betroffener Buchung `recompute_booking_payment_status`.
 *
 * Geplant via vercel.json: taeglich 06:00 UTC (08:00 CEST).
 * Auth: Vercel sendet `Authorization: Bearer <CRON_SECRET>`.
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

  const { data, error } = await supabase.rpc('mark_overdue_payments');
  if (error) {
    console.error('[cron/mark-overdue-payments]', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    bookings_recomputed: data,
    timestamp: new Date().toISOString(),
  });
}
