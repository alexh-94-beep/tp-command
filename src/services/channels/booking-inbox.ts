/**
 * IMAP-Pull fuer Booking.com-Mails.
 *
 * Verbindet sich mit der konfigurierten Mailbox, holt alle Mails seit
 * dem letzten Polling-Zeitpunkt (oder der letzten 7 Tage beim ersten
 * Run) und klassifiziert sie. Nur Booking-Mails werden weiterverarbeitet —
 * alles andere wird ignoriert (nicht angefasst).
 *
 * Wichtig:
 *   - Wir lesen nur, wir loeschen / verschieben / markieren NICHTS.
 *   - Office sieht die Mails weiterhin im Posteingang.
 *   - Dedup via processed_emails (Message-ID).
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import {
  classifyBookingEmail,
  parseNewReservation,
  parseCancellation,
  parseGuestMessage,
} from './booking-email-parser';

export interface InboxConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** TLS standard (993 → true, 143 → STARTTLS-Auto) */
  secure?: boolean;
}

export interface PollResult {
  fetched: number;
  newReservations: number;
  cancellations: number;
  guestMessages: number;
  skipped: number;
  errors: string[];
}

/**
 * Liest Booking-Mails aus der Mailbox und legt pending_reservations an
 * bzw. storniert. Lookup-Window: letzte 7 Tage (Booking-Mails sind kurz-
 * lebig; reicht fuer stuendlichen Cron bequem).
 */
export async function pollBookingInbox(
  supabase: SupabaseClient<Database>,
  config: InboxConfig,
): Promise<PollResult> {
  const result: PollResult = {
    fetched: 0,
    newReservations: 0,
    cancellations: 0,
    guestMessages: 0,
    skipped: 0,
    errors: [],
  };

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 993,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Letzte 7 Tage — IMAP SEARCH ist serverseitig effizient
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const uids = await client.search({ since, from: 'booking.com' });
      if (!uids || uids.length === 0) return result;

      // Bereits verarbeitete Message-IDs vorab holen, damit wir nicht
      // pro Mail einen Roundtrip machen muessen
      const { data: processedRows } = await supabase
        .from('processed_emails')
        .select('message_id')
        .gte('processed_at', since.toISOString());
      const processed = new Set(
        (processedRows ?? []).map((p) => p.message_id),
      );

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(String(uid), {
            envelope: true,
            source: true,
          });
          if (!msg || !msg.source) continue;
          result.fetched += 1;

          const parsed = await simpleParser(msg.source as Buffer);
          const messageId = parsed.messageId ?? `imap:${uid}`;
          if (processed.has(messageId)) continue;

          const from = parsed.from?.text ?? null;
          const subject = parsed.subject ?? null;
          const body = parsed.text ?? '';

          const kind = classifyBookingEmail(from, subject);
          if (!kind) {
            await supabase.from('processed_emails').insert({
              message_id: messageId,
              imap_uid: Number(uid),
              subject,
              from_address: from,
              action: 'skipped',
              raw_excerpt: (body ?? '').slice(0, 200),
            });
            result.skipped += 1;
            continue;
          }

          if (kind === 'new') {
            const r = parseNewReservation(subject ?? '', body);
            if (!r) {
              await supabase.from('processed_emails').insert({
                message_id: messageId,
                imap_uid: Number(uid),
                subject,
                from_address: from,
                action: 'skipped',
                error: 'Buchungs-Nr nicht extrahierbar',
                raw_excerpt: body.slice(0, 200),
              });
              result.skipped += 1;
              continue;
            }
            const reservationId = await ensurePendingReservation(supabase, r, body);
            await supabase.from('processed_emails').insert({
              message_id: messageId,
              imap_uid: Number(uid),
              subject,
              from_address: from,
              action: 'new_reservation',
              external_uid: r.externalUid,
              reservation_id: reservationId,
              raw_excerpt: body.slice(0, 200),
            });
            result.newReservations += 1;
            continue;
          }

          if (kind === 'guest_message') {
            const g = parseGuestMessage(from, subject, body);
            if (!g) {
              await supabase.from('processed_emails').insert({
                message_id: messageId,
                imap_uid: Number(uid),
                subject,
                from_address: from,
                action: 'skipped',
                error: 'Gast-Nachricht: Buchungs-Nr nicht extrahierbar',
                raw_excerpt: body.slice(0, 200),
              });
              result.skipped += 1;
              continue;
            }
            const { reservationId, action } = await applyGuestMessage(
              supabase,
              g.externalUid,
              g.guestName,
              subject ?? '',
            );
            await supabase.from('processed_emails').insert({
              message_id: messageId,
              imap_uid: Number(uid),
              subject,
              from_address: from,
              action,
              external_uid: g.externalUid,
              reservation_id: reservationId,
              raw_excerpt: body.slice(0, 200),
            });
            if (action === 'guest_message') result.guestMessages += 1;
            else result.skipped += 1;
            continue;
          }

          // kind === 'cancelled'
          const c = parseCancellation(subject ?? '', body);
          if (!c) {
            await supabase.from('processed_emails').insert({
              message_id: messageId,
              imap_uid: Number(uid),
              subject,
              from_address: from,
              action: 'skipped',
              error: 'Storno: Buchungs-Nr nicht extrahierbar',
              raw_excerpt: body.slice(0, 200),
            });
            result.skipped += 1;
            continue;
          }
          const reservationId = await applyCancellation(supabase, c.externalUid);
          await supabase.from('processed_emails').insert({
            message_id: messageId,
            imap_uid: Number(uid),
            subject,
            from_address: from,
            action: 'cancellation',
            external_uid: c.externalUid,
            reservation_id: reservationId,
            raw_excerpt: body.slice(0, 200),
          });
          result.cancellations += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push(`uid=${uid}: ${msg}`);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return result;
}

// ── DB-Helfer ─────────────────────────────────────────────────────────

async function ensurePendingReservation(
  supabase: SupabaseClient<Database>,
  r: {
    externalUid: string;
    bookingDetailUrl: string | null;
    guestName: string | null;
    startDate: string | null;
    endDate: string | null;
    guestCount: number | null;
  },
  rawBody: string,
): Promise<string | null> {
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('code', 'booking_com')
    .maybeSingle();
  if (!channel) return null;

  // Idempotent: gibt's schon? (UNIQUE(channel_id, external_uid))
  const { data: existing } = await supabase
    .from('pending_reservations')
    .select('id')
    .eq('channel_id', channel.id)
    .eq('external_uid', r.externalUid)
    .maybeSingle();
  if (existing) return existing.id;

  const summaryParts: string[] = [`Booking-Nr ${r.externalUid}`];
  if (r.guestName) summaryParts.push(r.guestName);

  const description = r.bookingDetailUrl
    ? `Details im Booking-Extranet:\n${r.bookingDetailUrl}\n\n` +
      'Datum + Gast-Daten dort einsehen und im Pool-Wizard ergaenzen.'
    : 'Keine Detail-URL erkannt — im Booking-Extranet nachsehen.';

  const { data: created, error } = await supabase
    .from('pending_reservations')
    .insert({
      channel_id: channel.id,
      external_uid: r.externalUid,
      // Wenn Datum unbekannt: heute als Platzhalter — Office korrigiert
      start_date: r.startDate ?? new Date().toISOString().slice(0, 10),
      end_date:
        r.endDate ??
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      summary: summaryParts.join(' · '),
      description,
      guest_count: r.guestCount,
      status: 'pending',
      raw_payload: {
        guestName: r.guestName,
        bookingDetailUrl: r.bookingDetailUrl,
        bodyExcerpt: rawBody.slice(0, 1000),
      },
    })
    .select('id')
    .single();
  if (error) return null;
  return created.id;
}

/**
 * Wendet eine Storno-Mail an:
 *   1. Pending-Reservation auf 'cancelled' setzen (falls vorhanden)
 *   2. Falls schon zugewiesene Buchung existiert → booking.status='cancelled'
 *      + Reinigungs-Tasks abbrechen + Audit-Eintrag
 */
async function applyCancellation(
  supabase: SupabaseClient<Database>,
  externalUid: string,
): Promise<string | null> {
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('code', 'booking_com')
    .maybeSingle();
  if (!channel) return null;

  const { data: reservation } = await supabase
    .from('pending_reservations')
    .select('id, assigned_booking_id, status')
    .eq('channel_id', channel.id)
    .eq('external_uid', externalUid)
    .maybeSingle();

  if (reservation) {
    await supabase
      .from('pending_reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservation.id);

    if (reservation.assigned_booking_id) {
      await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', reservation.assigned_booking_id);
      // Reinigung dieser Buchung abbrechen (idempotent — pre_checkin/checkout)
      await supabase
        .from('cleaning_tasks')
        .update({
          status: 'cancelled',
          cancellation_reason: 'Booking-Storno per E-Mail',
          cancelled_at: new Date().toISOString(),
        })
        .eq('booking_id', reservation.assigned_booking_id)
        .in('status', ['open', 'in_progress']);
      // Audit (best-effort; service-role-Schreibe darf actor=NULL)
      await supabase.from('audit_log').insert({
        actor_id: null,
        entity_type: 'booking',
        entity_id: reservation.assigned_booking_id,
        action: 'cancelled',
        diff: {
          _note: `Storno per Booking.com-Mail (Nr ${externalUid})`,
        },
      });
    } else {
      await supabase.from('audit_log').insert({
        actor_id: null,
        entity_type: 'pending_reservation',
        entity_id: reservation.id,
        action: 'cancelled',
        diff: {
          _note: `Storno per Booking.com-Mail (Nr ${externalUid})`,
        },
      });
    }
    return reservation.id;
  }

  // Storno fuer eine Reservation, die wir gar nicht haben → loggen, sonst nix
  return null;
}

/**
 * Behandelt eine Gast-Nachricht: extrahiert Gast-Name + Buchungs-Nr,
 * traegt den Namen an der bestehenden pending_reservation nach (falls
 * noch nicht gesetzt) und legt einen standalone_task fuer Office an,
 * damit jemand im Booking-Extranet antwortet.
 *
 * Liefert reservation_id (falls eine existiert) + die action, die ins
 * processed_emails-Log soll: 'guest_message' wenn alles geklappt hat,
 * 'skipped' wenn die Reservation gar nicht im System ist (z.B. alte
 * Buchung von vor IMAP-Start).
 */
async function applyGuestMessage(
  supabase: SupabaseClient<Database>,
  externalUid: string,
  guestName: string | null,
  subject: string,
): Promise<{ reservationId: string | null; action: 'guest_message' | 'skipped' }> {
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('code', 'booking_com')
    .maybeSingle();
  if (!channel) return { reservationId: null, action: 'skipped' };

  const { data: reservation } = await supabase
    .from('pending_reservations')
    .select('id, summary, assigned_booking_id, status')
    .eq('channel_id', channel.id)
    .eq('external_uid', externalUid)
    .maybeSingle();

  // Wenn wir die Reservation nicht haben: nur loggen (alte Buchung)
  if (!reservation) {
    return { reservationId: null, action: 'skipped' };
  }

  // Wenn summary noch keinen erkennbaren Namen hat, nachtragen
  if (guestName) {
    const hasName =
      reservation.summary &&
      !reservation.summary.startsWith('Booking-Nr ') &&
      reservation.summary.length > 0;
    if (!hasName) {
      const newSummary = `Booking-Nr ${externalUid} · ${guestName}`;
      await supabase
        .from('pending_reservations')
        .update({ summary: newSummary })
        .eq('id', reservation.id);
    }
  }

  // Standalone-Task fuer Office: "Booking-Gast schreibt — antworten"
  // Nur einmal pro Buchungs-Nr — wenn schon ein offener Task da ist, skip.
  const taskTitle = `Booking-Gast schreibt: ${guestName ?? `Buchung ${externalUid}`}`;
  const { data: existingTask } = await supabase
    .from('standalone_tasks')
    .select('id')
    .eq('title', taskTitle)
    .in('status', ['open', 'in_progress'])
    .maybeSingle();
  if (!existingTask) {
    await supabase.from('standalone_tasks').insert({
      title: taskTitle,
      description:
        `Booking.com-Gast hat eine Nachricht geschickt.\n\n` +
        `Buchungs-Nr: ${externalUid}\n` +
        `Subject: ${subject}\n\n` +
        `Im Booking-Extranet antworten.`,
      category: 'office',
      priority: 'normal',
      status: 'open',
    });
  }

  // Audit
  await supabase.from('audit_log').insert({
    actor_id: null,
    entity_type: 'pending_reservation',
    entity_id: reservation.id,
    action: 'updated',
    diff: {
      _note: `Gast-Nachricht eingegangen (${guestName ?? '—'})`,
    },
  });

  return { reservationId: reservation.id, action: 'guest_message' };
}
