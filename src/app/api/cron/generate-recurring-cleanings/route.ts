import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { applyCleaningRecurrenceForBooking } from '@/services/cleaning/apply-recurrence';

/**
 * Phase 26d: Taeglicher Cron — generiert wiederkehrende Reinigungen
 * fuer alle aktiven Buchungen mit cleaning_recurrence != 'none'.
 *
 * vercel.json: schedule "30 4 * * *" (täglich 04:30 UTC = 06:30 CEST).
 * Rollierender Horizont: 3 Monate ab heute, oder bis Auszug-Datum bei
 * Buchungen mit fixem Ende.
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

  const today = new Date().toISOString().slice(0, 10);
  // Aktive Buchungen mit Wiederkehr — laufende oder zukuenftige
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id')
    .neq('cleaning_recurrence', 'none')
    .in('status', ['planned', 'active'])
    .or(`end_date.gte.${today},end_date.eq.9999-12-31`);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let totalCreated = 0;
  let totalRemoved = 0;
  const errors: string[] = [];
  for (const b of bookings ?? []) {
    try {
      const r = await applyCleaningRecurrenceForBooking(supabase, b.id);
      if (!r.ok) errors.push(`${b.id}: ${r.error}`);
      else {
        totalCreated += r.created;
        totalRemoved += r.removed;
      }
    } catch (e) {
      errors.push(`${b.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed: bookings?.length ?? 0,
    created: totalCreated,
    removed: totalRemoved,
    errors,
  });
}
