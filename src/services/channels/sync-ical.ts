/**
 * Pull-Sync für iCal-basierte Channels (Booking.com, Airbnb, Expedia).
 *
 * Ablauf pro Wohnung x Channel:
 *   1. iCal-URL fetchen
 *   2. Events parsen
 *   3. Pro Event: existierende Buchung mit external_reference suchen
 *      - Nicht gefunden → neu anlegen (Status planned/active je nach Datum)
 *      - Gefunden, Daten gleich → skip
 *      - Gefunden, Daten anders → updaten
 *   4. Buchungen, die wir aus diesem Channel/Wohnung haben, aber nicht mehr
 *      im iCal sind, werden auf "cancelled" gesetzt (außer status=completed/active)
 */
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { parseICal, type ICalEvent } from '@/lib/channels/booking/ical';
import { logger } from '@/lib/logger';
import { instantiateBookingTasks } from '@/services/workflow/instantiate';

export interface SyncResult {
  apartment_id: string;
  channel_code: string;
  fetched: number;
  inserted: number;
  updated: number;
  cancelled: number;
  errors: string[];
}

interface TenantPlaceholderMap {
  [channelCode: string]: string; // channelCode → tenant_id
}

const PLACEHOLDER_TENANTS: Record<string, { first_name: string; last_name: string; email: string }> = {
  booking_com: {
    first_name: 'Booking.com',
    last_name: '(Gast)',
    email: 'guests+bookingcom@tp-command.local',
  },
  airbnb: {
    first_name: 'Airbnb',
    last_name: '(Gast)',
    email: 'guests+airbnb@tp-command.local',
  },
  expedia: {
    first_name: 'Expedia',
    last_name: '(Gast)',
    email: 'guests+expedia@tp-command.local',
  },
};

async function ensurePlaceholderTenant(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  channelCode: string,
  cache: TenantPlaceholderMap,
): Promise<string | null> {
  if (cache[channelCode]) return cache[channelCode];
  const def = PLACEHOLDER_TENANTS[channelCode];
  if (!def) return null;
  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('email', def.email)
    .maybeSingle();
  if (existing) {
    cache[channelCode] = existing.id;
    return existing.id;
  }
  const { data: created, error } = await supabase
    .from('tenants')
    .insert({
      tenant_kind: 'guest',
      first_name: def.first_name,
      last_name: def.last_name,
      email: def.email,
      source: channelCode === 'booking_com' ? 'booking_com' : channelCode === 'airbnb' ? 'airbnb' : 'expedia',
    })
    .select('id')
    .single();
  if (error || !created) return null;
  cache[channelCode] = created.id;
  return created.id;
}

function statusFromDates(startIso: string, endIso: string): 'planned' | 'active' | 'completed' {
  const today = new Date().toISOString().slice(0, 10);
  if (endIso <= today) return 'completed';
  if (startIso <= today && endIso > today) return 'active';
  return 'planned';
}

export async function syncAllChannels(): Promise<SyncResult[]> {
  const supabase = createSupabaseServiceClient();

  // Alle aktiven Channel-Verknüpfungen mit pull-URL holen
  const { data: links } = await supabase
    .from('apartment_channel_links')
    .select(
      'apartment_id, channel_id, external_id, ical_pull_url, channel:channels(code, is_active)',
    )
    .not('ical_pull_url', 'is', null);

  const results: SyncResult[] = [];
  const tenantCache: TenantPlaceholderMap = {};

  for (const link of links ?? []) {
    const channel = link.channel as { code: string; is_active: boolean } | null;
    if (!channel || !channel.is_active) continue;
    if (!link.ical_pull_url) continue;
    const r = await syncOne(
      supabase,
      tenantCache,
      link.apartment_id,
      link.channel_id,
      channel.code,
      link.ical_pull_url,
    );
    results.push(r);
  }
  return results;
}

export async function syncSingleApartment(apartmentId: string): Promise<SyncResult[]> {
  const supabase = createSupabaseServiceClient();
  const { data: links } = await supabase
    .from('apartment_channel_links')
    .select(
      'apartment_id, channel_id, external_id, ical_pull_url, channel:channels(code, is_active)',
    )
    .eq('apartment_id', apartmentId)
    .not('ical_pull_url', 'is', null);

  const tenantCache: TenantPlaceholderMap = {};
  const results: SyncResult[] = [];
  for (const link of links ?? []) {
    const channel = link.channel as { code: string; is_active: boolean } | null;
    if (!channel || !channel.is_active || !link.ical_pull_url) continue;
    const r = await syncOne(
      supabase,
      tenantCache,
      link.apartment_id,
      link.channel_id,
      channel.code,
      link.ical_pull_url,
    );
    results.push(r);
  }
  return results;
}

async function syncOne(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  tenantCache: TenantPlaceholderMap,
  apartmentId: string,
  channelId: string,
  channelCode: string,
  icalUrl: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    apartment_id: apartmentId,
    channel_code: channelCode,
    fetched: 0,
    inserted: 0,
    updated: 0,
    cancelled: 0,
    errors: [],
  };

  // 1) iCal abrufen
  let events: ICalEvent[] = [];
  try {
    const res = await fetch(icalUrl, {
      headers: { 'User-Agent': process.env.BOOKING_ICAL_USER_AGENT ?? 'TP-Command/1.0' },
      cache: 'no-store',
    });
    if (!res.ok) {
      result.errors.push(`HTTP ${res.status} beim Abruf von ${icalUrl}`);
      return result;
    }
    events = parseICal(await res.text());
    result.fetched = events.length;
  } catch (e) {
    result.errors.push(`Fetch-Fehler: ${(e as Error).message}`);
    return result;
  }

  // 2) Tenant-Platzhalter sicherstellen
  const tenantId = await ensurePlaceholderTenant(supabase, channelCode, tenantCache);
  if (!tenantId) {
    result.errors.push(`Kein Platzhalter-Mieter für Channel ${channelCode} verfügbar`);
    return result;
  }

  // 3) Existierende Buchungen aus diesem Channel/Wohnung laden
  const { data: existing } = await supabase
    .from('bookings')
    .select('id, external_reference, start_date, end_date, status')
    .eq('apartment_id', apartmentId)
    .eq('channel_id', channelId);

  const existingByRef = new Map(
    (existing ?? [])
      .filter((b) => b.external_reference)
      .map((b) => [b.external_reference as string, b]),
  );
  const seenRefs = new Set<string>();

  for (const ev of events) {
    const ref = `${channelCode}:${ev.uid}`;
    seenRefs.add(ref);
    const start = ev.start.slice(0, 10);
    const end = ev.end.slice(0, 10);
    if (end <= start) continue;
    const status = statusFromDates(start, end);
    const notes =
      `Aus ${channelCode} synchronisiert.\nUID: ${ev.uid}\nSummary: ${ev.summary}` +
      (ev.description ? `\n\n${ev.description}` : '');

    const e = existingByRef.get(ref);
    if (!e) {
      const { data: inserted, error } = await supabase
        .from('bookings')
        .insert({
          apartment_id: apartmentId,
          tenant_id: tenantId,
          channel_id: channelId,
          rental_type: 'booking',
          external_reference: ref,
          start_date: start,
          end_date: end,
          rent_amount: 0,
          deposit_amount: 0,
          contract_status: 'signed',
          status,
          notes,
        })
        .select('id')
        .single();
      if (error) {
        if (error.message.includes('bookings_no_overlap')) {
          result.errors.push(`Konflikt bei ${ref}: ${start}-${end} überlappt mit anderer Buchung`);
        } else {
          result.errors.push(`Insert ${ref}: ${error.message}`);
        }
      } else {
        result.inserted++;
        if (inserted?.id) {
          // Workflow-Aufgaben für Booking-Aufenthalte instanziieren
          await instantiateBookingTasks(supabase, inserted.id);
        }
      }
    } else if (e.start_date !== start || e.end_date !== end) {
      const { error } = await supabase
        .from('bookings')
        .update({ start_date: start, end_date: end, status, notes })
        .eq('id', e.id);
      if (error) result.errors.push(`Update ${ref}: ${error.message}`);
      else result.updated++;
    }
  }

  // 4) Buchungen, die nicht mehr im iCal sind, stornieren (nur planned)
  for (const [ref, e] of existingByRef) {
    if (seenRefs.has(ref)) continue;
    if (e.status !== 'planned') continue; // aktive/completed nicht anfassen
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', contract_status: 'cancelled' })
      .eq('id', e.id);
    if (!error) result.cancelled++;
  }

  logger.info('ical-sync', { apartmentId, channelCode, ...result });
  return result;
}
