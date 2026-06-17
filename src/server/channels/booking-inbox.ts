'use server';

import { ImapFlow } from 'imapflow';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { requireRole } from '@/lib/auth/session';
import { pollBookingInbox } from '@/services/channels/booking-inbox';

function readImapEnv() {
  const host = process.env.BOOKING_IMAP_HOST;
  const port = Number(process.env.BOOKING_IMAP_PORT ?? 993);
  const user = process.env.BOOKING_IMAP_USER;
  const password = process.env.BOOKING_IMAP_PASSWORD;
  return { host, port, user, password };
}

export async function testBookingInboxConnection(): Promise<{
  ok: boolean;
  error?: string;
  recentBookingCount?: number;
  hostInfo?: string;
}> {
  await requireRole(['admin']);
  const { host, port, user, password } = readImapEnv();
  if (!host || !user || !password) {
    return { ok: false, error: 'BOOKING_IMAP_* Env-Vars fehlen.' };
  }
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass: password },
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let count = 0;
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const uids = await client.search({ since, from: 'booking.com' });
      count = Array.isArray(uids) ? uids.length : 0;
    } finally {
      lock.release();
    }
    await client.logout().catch(() => {});
    return {
      ok: true,
      recentBookingCount: count,
      hostInfo: `${user}@${host}:${port}`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await client.logout();
    } catch {
      /* noop */
    }
    return { ok: false, error: message };
  }
}

export async function runBookingInboxPoll(): Promise<{
  ok: boolean;
  error?: string;
  fetched?: number;
  newReservations?: number;
  cancellations?: number;
  skipped?: number;
  errors?: string[];
}> {
  await requireRole(['admin']);
  const { host, port, user, password } = readImapEnv();
  if (!host || !user || !password) {
    return { ok: false, error: 'BOOKING_IMAP_* Env-Vars fehlen.' };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { ok: false, error: 'Supabase-Env fehlt.' };
  }
  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const r = await pollBookingInbox(supabase, { host, port, user, password });
  return {
    ok: true,
    fetched: r.fetched,
    newReservations: r.newReservations,
    cancellations: r.cancellations,
    skipped: r.skipped,
    errors: r.errors,
  };
}
