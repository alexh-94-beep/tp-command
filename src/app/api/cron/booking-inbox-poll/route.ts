import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { pollBookingInbox } from '@/services/channels/booking-inbox';

/**
 * Stuendlicher Cron: holt Booking.com-Mails aus info@tp-apartments.ch
 * und legt pending_reservations / Stornos an.
 *
 * vercel.json: schedule "0 * * * *" (jede Stunde zur vollen Stunde).
 * Auth: Bearer CRON_SECRET. Service-Role-Client (bypasst RLS, damit
 * processed_emails + pending_reservations geschrieben werden koennen).
 *
 * ENV (Vercel Production):
 *   BOOKING_IMAP_HOST     z.B. imap.cyon.ch / imap.gmail.com
 *   BOOKING_IMAP_PORT     993 (IMAPS) oder 143 (STARTTLS)
 *   BOOKING_IMAP_USER     info@tp-apartments.ch
 *   BOOKING_IMAP_PASSWORD App-Passwort
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

  const host = process.env.BOOKING_IMAP_HOST;
  const port = Number(process.env.BOOKING_IMAP_PORT ?? 993);
  const user = process.env.BOOKING_IMAP_USER;
  const password = process.env.BOOKING_IMAP_PASSWORD;
  if (!host || !user || !password) {
    return NextResponse.json(
      { ok: false, error: 'missing imap env' },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const r = await pollBookingInbox(supabase, { host, port, user, password });
    return NextResponse.json({ ok: true, result: r });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/booking-inbox-poll]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
