/**
 * Pool-Sync für Channels, deren Inserate auf Booking.com / Airbnb / Expedia
 * NICHT 1:1 auf eine Wohnung mappen, sondern auf einen generischen Inserat-Pool.
 *
 * Reservationen landen in `pending_reservations` und müssen vom Office einer
 * konkreten Wohnung zugewiesen werden.
 */
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { parseICal, type ICalEvent } from '@/lib/channels/booking/ical';
import { logger } from '@/lib/logger';

export interface PoolSyncResult {
  channel_code: string;
  fetched: number;
  inserted: number;
  updated: number;
  cancelled: number;
  errors: string[];
}

export async function syncAllChannelPools(): Promise<PoolSyncResult[]> {
  const supabase = createSupabaseServiceClient();
  const { data: channels } = await supabase
    .from('channels')
    .select('id, code, config, is_active')
    .eq('is_active', true);

  const results: PoolSyncResult[] = [];
  for (const ch of channels ?? []) {
    const cfg = (ch.config ?? {}) as { pool_ical_url?: string };
    if (!cfg.pool_ical_url) continue;
    const r = await syncPool(ch.id, ch.code, cfg.pool_ical_url);
    results.push(r);
  }
  return results;
}

export async function syncSingleChannelPool(channelId: string): Promise<PoolSyncResult | null> {
  const supabase = createSupabaseServiceClient();
  const { data: channel } = await supabase
    .from('channels')
    .select('id, code, config, is_active')
    .eq('id', channelId)
    .maybeSingle();
  if (!channel) return null;
  const cfg = (channel.config ?? {}) as { pool_ical_url?: string };
  if (!cfg.pool_ical_url) return null;
  return syncPool(channel.id, channel.code, cfg.pool_ical_url);
}

async function syncPool(
  channelId: string,
  channelCode: string,
  icalUrl: string,
): Promise<PoolSyncResult> {
  const supabase = createSupabaseServiceClient();
  const result: PoolSyncResult = {
    channel_code: channelCode,
    fetched: 0,
    inserted: 0,
    updated: 0,
    cancelled: 0,
    errors: [],
  };

  let events: ICalEvent[] = [];
  try {
    const res = await fetch(icalUrl, {
      headers: { 'User-Agent': process.env.BOOKING_ICAL_USER_AGENT ?? 'TP-Command/1.0' },
      cache: 'no-store',
    });
    if (!res.ok) {
      result.errors.push(`HTTP ${res.status} beim Abruf`);
      return result;
    }
    events = parseICal(await res.text());
    result.fetched = events.length;
  } catch (e) {
    result.errors.push(`Fetch-Fehler: ${(e as Error).message}`);
    return result;
  }

  // Existierende pending laden
  const { data: existing } = await supabase
    .from('pending_reservations')
    .select('id, external_uid, status, start_date, end_date')
    .eq('channel_id', channelId);
  const existingByUid = new Map(
    (existing ?? []).map((p) => [p.external_uid, p]),
  );
  const seenUids = new Set<string>();

  for (const ev of events) {
    seenUids.add(ev.uid);
    const start = ev.start.slice(0, 10);
    const end = ev.end.slice(0, 10);
    if (end <= start) continue;

    const e = existingByUid.get(ev.uid);
    if (!e) {
      const { error } = await supabase.from('pending_reservations').insert({
        channel_id: channelId,
        external_uid: ev.uid,
        start_date: start,
        end_date: end,
        summary: ev.summary,
        description: ev.description ?? null,
        raw_payload: ev as unknown as Record<string, unknown>,
      });
      if (error) result.errors.push(`Insert ${ev.uid}: ${error.message}`);
      else result.inserted++;
    } else if (e.status === 'pending' && (e.start_date !== start || e.end_date !== end)) {
      const { error } = await supabase
        .from('pending_reservations')
        .update({
          start_date: start,
          end_date: end,
          summary: ev.summary,
          description: ev.description ?? null,
        })
        .eq('id', e.id);
      if (error) result.errors.push(`Update ${ev.uid}: ${error.message}`);
      else result.updated++;
    }
  }

  // Verschwundene pending: cancelled. Bei "assigned" lassen wir sie.
  for (const [uid, e] of existingByUid) {
    if (seenUids.has(uid)) continue;
    if (e.status !== 'pending') continue;
    const { error } = await supabase
      .from('pending_reservations')
      .update({ status: 'cancelled' })
      .eq('id', e.id);
    if (!error) result.cancelled++;
  }

  logger.info('pool-sync', { channelCode, ...result });
  return result;
}
