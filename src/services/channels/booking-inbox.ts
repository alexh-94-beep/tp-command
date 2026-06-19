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
  parseArrivalsSummary,
  extractDateFromSubject,
  extractBookingNumber,
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
  modifications: number;
  arrivalsSummaries: number;
  /** Pool-Reservationen, die per Tagesübersicht Daten/Name nachgereicht bekommen haben */
  arrivalsUpdated: number;
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
    modifications: 0,
    arrivalsSummaries: 0,
    arrivalsUpdated: 0,
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
                raw_excerpt: body.slice(0, 5000),
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
              raw_excerpt: body.slice(0, 5000),
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
                raw_excerpt: body.slice(0, 5000),
              });
              result.skipped += 1;
              continue;
            }
            const { reservationId, action } = await applyGuestMessage(
              supabase,
              g.externalUid,
              g.guestName,
              subject ?? '',
              body,
            );
            await supabase.from('processed_emails').insert({
              message_id: messageId,
              imap_uid: Number(uid),
              subject,
              from_address: from,
              action,
              external_uid: g.externalUid,
              reservation_id: reservationId,
              raw_excerpt: body.slice(0, 5000),
            });
            if (action === 'guest_message') result.guestMessages += 1;
            else result.skipped += 1;
            continue;
          }

          if (kind === 'booking_modified') {
            const newDate = extractDateFromSubject(subject);
            const uid = extractBookingNumber(`${subject ?? ''}\n${body}`);
            if (!uid) {
              await supabase.from('processed_emails').insert({
                message_id: messageId,
                imap_uid: Number(uid),
                subject,
                from_address: from,
                action: 'skipped',
                error: 'Modified: Buchungs-Nr nicht extrahierbar',
                raw_excerpt: body.slice(0, 5000),
              });
              result.skipped += 1;
              continue;
            }
            const mod = await applyBookingModified(supabase, uid, newDate, body);
            await supabase.from('processed_emails').insert({
              message_id: messageId,
              imap_uid: Number(uid),
              subject,
              from_address: from,
              action: mod.reservationId ? 'booking_modified' : 'skipped',
              external_uid: uid,
              reservation_id: mod.reservationId,
              error: mod.error ?? null,
              raw_excerpt: body.slice(0, 5000),
            });
            if (mod.reservationId) result.modifications += 1;
            else result.skipped += 1;
            continue;
          }

          if (kind === 'arrivals_summary') {
            const entries = parseArrivalsSummary(body);
            const { added, updated } = await applyArrivalsSummary(supabase, entries);
            await supabase.from('processed_emails').insert({
              message_id: messageId,
              imap_uid: Number(uid),
              subject,
              from_address: from,
              action: 'arrivals_summary',
              raw_excerpt: body.slice(0, 5000),
              error: `${entries.length} Anreisen erkannt, ${added} neu, ${updated} aktualisiert`,
            });
            result.arrivalsSummaries += 1;
            result.arrivalsUpdated += updated;
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
              raw_excerpt: body.slice(0, 5000),
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
            raw_excerpt: body.slice(0, 5000),
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
        // Wenn Bestaetigungs-Mail Datum NICHT mitgesendet hat → Mireme muss
        // im Booking-Extranet verifizieren bevor die Reservation in eine
        // Buchung uebernommen werden darf (Phase 22h).
        dates_verified: Boolean(r.startDate && r.endDate),
        source: 'new_reservation',
      },
    })
    .select('id')
    .single();
  if (error) {
    console.error(
      '[ensurePendingReservation] insert failed for uid=' +
        r.externalUid +
        ':',
      error.message,
      error.details,
      error.hint,
    );
    return null;
  }
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
  body: string,
): Promise<{ reservationId: string | null; action: 'guest_message' | 'skipped' }> {
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('code', 'booking_com')
    .maybeSingle();
  if (!channel) return { reservationId: null, action: 'skipped' };

  const { data: reservation } = await supabase
    .from('pending_reservations')
    .select('id, summary, description, raw_payload, assigned_booking_id, status')
    .eq('channel_id', channel.id)
    .eq('external_uid', externalUid)
    .maybeSingle();

  // Wenn wir die Reservation nicht haben: nur loggen (alte Buchung)
  if (!reservation) {
    return { reservationId: null, action: 'skipped' };
  }

  // Phase 22b: Detail-URL nachtragen falls aktuell unbrauchbar/fehlt.
  // Gast-Mails enthalten den korrekten Booking-Extranet-Link mit res_id
  // im Body — den nehmen wir.
  const { extractBookingDetailUrl } = await import('./booking-email-parser');
  const rawPayload =
    (reservation.raw_payload as Record<string, unknown> | null) ?? {};
  const existingUrl =
    typeof rawPayload.bookingDetailUrl === 'string'
      ? rawPayload.bookingDetailUrl
      : null;
  const newUrl = extractBookingDetailUrl(body, externalUid);
  let urlUpdated = false;
  if (newUrl && newUrl !== existingUrl) {
    rawPayload.bookingDetailUrl = newUrl;
    // Description ebenfalls auffrischen, damit Office den Link in den
    // Pool-Notizen findet (assignReservation übernimmt das später in
    // booking.notes).
    const newDesc =
      `Details im Booking-Extranet:\n${newUrl}\n\n` +
      'Datum + Gast-Daten dort einsehen.';
    await supabase
      .from('pending_reservations')
      .update({ raw_payload: rawPayload as never, description: newDesc })
      .eq('id', reservation.id);
    urlUpdated = true;
  }

  // Wenn summary noch keinen erkennbaren Namen hat, nachtragen
  if (guestName) {
    const hasName =
      reservation.summary &&
      reservation.summary.includes(' · ') &&
      reservation.summary.length > 0;
    if (!hasName) {
      const newSummary = `Booking-Nr ${externalUid} · ${guestName}`;
      await supabase
        .from('pending_reservations')
        .update({ summary: newSummary })
        .eq('id', reservation.id);
    }
  }

  // Standalone-Task für Office: "Booking-Gast schreibt — antworten"
  // Nur einmal pro Buchungs-Nr — wenn schon ein offener Task da ist, skip.
  const taskTitle = `Booking-Gast schreibt: ${guestName ?? `Buchung ${externalUid}`}`;
  const { data: existingTask } = await supabase
    .from('standalone_tasks')
    .select('id')
    .eq('title', taskTitle)
    .in('status', ['open', 'in_progress'])
    .maybeSingle();
  if (!existingTask) {
    // Phase 22d: Body-Excerpt in Task-Description einbetten, damit Office
    // direkt sieht was angefragt wird — ohne ins Extranet wechseln zu müssen.
    const cleanedBody = cleanGuestMessageBody(body);
    await supabase.from('standalone_tasks').insert({
      title: taskTitle,
      description:
        `Booking.com-Gast hat eine Nachricht geschickt.\n\n` +
        `Buchungs-Nr: ${externalUid}\n` +
        (newUrl ? `Buchungs-Link: ${newUrl}\n` : '') +
        `Subject: ${subject}\n\n` +
        `--- Nachricht ---\n${cleanedBody}\n--- Ende ---\n\n` +
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
      _note: `Gast-Nachricht eingegangen (${guestName ?? '—'})${urlUpdated ? ' + Link aktualisiert' : ''}`,
    },
  });

  return { reservationId: reservation.id, action: 'guest_message' };
}

/**
 * Booking-Gast-Mails enthalten viel Boilerplate (HTML-Tracking-Pixel,
 * URLs, "##- Antwort hier -##"-Trennzeilen). Wir filtern das raus und
 * geben max. 1500 Zeichen "sauberen" Text zurueck — Office liest das
 * direkt im Standalone-Task.
 */
function addOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function cleanGuestMessageBody(body: string): string {
  return body
    // Antwort-Marker entfernen
    .replace(/##-.*?-##/g, '')
    // URLs ausblenden (waren oft mehrere Tracking-Links)
    .replace(/https?:\/\/\S+/g, '[Link]')
    // Mehrfache Leerzeilen reduzieren
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1500);
}

/**
 * Bestätigte Buchungs-Änderung (Datum) anwenden.
 *
 * - Pool-Reservation pending: start_date/end_date updaten, Audit-Diff
 * - Zugewiesene Buchung: Kollisions-Check mit anderen Buchungen
 *   in derselben Wohnung. Bei Konflikt: NICHT updaten, sondern
 *   Office-Task + Mireme-Hinweis als standalone_task anlegen.
 * - Keine Reservation vorhanden: anlegen wie new_reservation
 */
async function applyBookingModified(
  supabase: SupabaseClient<Database>,
  externalUid: string,
  newStartDate: string | null,
  body: string,
): Promise<{ reservationId: string | null; error?: string }> {
  const { extractBookingDetailUrl } = await import('./booking-email-parser');
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('code', 'booking_com')
    .maybeSingle();
  if (!channel) return { reservationId: null, error: 'channel fehlt' };

  const { data: reservation } = await supabase
    .from('pending_reservations')
    .select(
      'id, status, start_date, end_date, assigned_booking_id, raw_payload, description, summary',
    )
    .eq('channel_id', channel.id)
    .eq('external_uid', externalUid)
    .maybeSingle();

  // 1. Keine Reservation: als neue anlegen
  if (!reservation) {
    const today = new Date().toISOString().slice(0, 10);
    const sd = newStartDate ?? today;
    const ed = addOneDay(sd);
    const url = extractBookingDetailUrl(body, externalUid);
    const { data: created } = await supabase
      .from('pending_reservations')
      .insert({
        channel_id: channel.id,
        external_uid: externalUid,
        start_date: sd,
        end_date: ed,
        summary: `Booking-Nr ${externalUid}`,
        description:
          'Aus Buchungs-Änderungs-Mail erfasst — ursprüngliche Bestätigung fehlt.\n\n' +
          (url ? `Booking-Extranet: ${url}` : ''),
        status: 'pending',
        raw_payload: { bookingDetailUrl: url } as never,
      })
      .select('id')
      .single();
    return { reservationId: created?.id ?? null };
  }

  // 2. Detail-URL nachtragen wenn fehlt
  const rawPayload =
    (reservation.raw_payload as Record<string, unknown> | null) ?? {};
  const existingUrl =
    typeof rawPayload.bookingDetailUrl === 'string'
      ? rawPayload.bookingDetailUrl
      : null;
  const newUrl = extractBookingDetailUrl(body, externalUid);
  if (newUrl && newUrl !== existingUrl) {
    rawPayload.bookingDetailUrl = newUrl;
    await supabase
      .from('pending_reservations')
      .update({ raw_payload: rawPayload as never })
      .eq('id', reservation.id);
  }

  // 3. Pool ohne Zuweisung: Datum updaten + Audit
  if (!reservation.assigned_booking_id) {
    if (newStartDate && newStartDate !== reservation.start_date) {
      const newEnd = addOneDay(newStartDate);
      await supabase
        .from('pending_reservations')
        .update({ start_date: newStartDate, end_date: newEnd })
        .eq('id', reservation.id);
      await supabase.from('audit_log').insert({
        actor_id: null,
        entity_type: 'pending_reservation',
        entity_id: reservation.id,
        action: 'updated',
        diff: {
          start_date: { before: reservation.start_date, after: newStartDate },
          _note: 'Datumsänderung per Booking-Mail',
        },
      });
    }
    return { reservationId: reservation.id };
  }

  // 4. Buchung schon zugewiesen: Kollisions-Check
  if (!newStartDate) return { reservationId: reservation.id };
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, apartment_id, start_date, end_date, status')
    .eq('id', reservation.assigned_booking_id)
    .maybeSingle();
  if (!booking) return { reservationId: reservation.id };

  const newEnd = addOneDay(newStartDate);
  // Suche andere Buchungen in derselben Wohnung die in den neuen Zeitraum
  // fallen (excl. die eigene)
  const { data: conflicts } = await supabase
    .from('bookings')
    .select('id, start_date, end_date, status')
    .eq('apartment_id', booking.apartment_id)
    .neq('id', booking.id)
    .in('status', ['planned', 'active'])
    .lt('start_date', newEnd)
    .gt('end_date', newStartDate);

  if (conflicts && conflicts.length > 0) {
    // KOLLISION: nicht updaten, sondern menschlich entscheiden lassen
    await supabase.from('standalone_tasks').insert({
      title: `⚠️ Booking-Datumsänderung kollidiert (${externalUid})`,
      description:
        `Booking.com hat eine Datumsänderung für Buchung ${externalUid} bestätigt:\n` +
        `Wohnung ${booking.apartment_id} · ${reservation.start_date} → ${newStartDate}\n\n` +
        `In der Wohnung gibt es bereits ${conflicts.length} andere Buchung(en) ` +
        `im neuen Zeitraum. Bitte manuell entscheiden:\n` +
        ` • Buchung in andere Wohnung verschieben\n` +
        ` • Datums-Update verweigern (im Booking-Extranet stornieren)\n` +
        ` • Eine andere Buchung verlegen\n\n` +
        `Booking-Extranet: ${newUrl ?? ''}`,
      category: 'office',
      priority: 'urgent',
      status: 'open',
    });
    // Plus Mireme-Hinweis: standalone_task auch fuer Cleaning sichtbar
    await supabase.from('standalone_tasks').insert({
      title: `⚠️ Reinigungsplan kann sich ändern (Buchung ${externalUid})`,
      description:
        `Eine Booking.com-Datumsänderung kollidiert mit existierenden Buchungen ` +
        `in Wohnung ${booking.apartment_id}. Office klärt das gerade. ` +
        `Reinigungsplan ggf. anpassen sobald die Buchungen neu verteilt sind.`,
      category: 'office',
      priority: 'high',
      status: 'open',
    });
    return {
      reservationId: reservation.id,
      error: `Kollision mit ${conflicts.length} Buchungen — Office benachrichtigt`,
    };
  }

  // 5. Keine Kollision: silent Buchung updaten + Audit
  await supabase
    .from('bookings')
    .update({ start_date: newStartDate, end_date: newEnd })
    .eq('id', booking.id);
  await supabase.from('audit_log').insert({
    actor_id: null,
    entity_type: 'booking',
    entity_id: booking.id,
    action: 'updated',
    diff: {
      start_date: { before: booking.start_date, after: newStartDate },
      end_date: { before: booking.end_date, after: newEnd },
      _note: 'Datumsänderung per Booking.com-Mail bestätigt',
    },
  });
  return { reservationId: reservation.id };
}

/**
 * Arrivals-Summary verarbeiten: pro Eintrag prüfen ob bereits eine
 * Pool-Reservation existiert.
 *  - Nicht vorhanden → anlegen (Safety-Net, Bestätigungs-Mail verloren).
 *  - Vorhanden, noch nicht zugewiesen → Daten/Name backfillen, sofern die
 *    Tagesübersicht echte Tabellen-Daten liefert und etwas davon
 *    abweicht. Audit-Log-Eintrag pro Update.
 *  - Vorhanden + zugewiesen → unverändert lassen.
 *
 * Liefert die Zähler { added, updated }.
 */
async function applyArrivalsSummary(
  supabase: SupabaseClient<Database>,
  entries: {
    externalUid: string;
    bookingDetailUrl: string | null;
    guestName: string | null;
    startDate: string | null;
    endDate: string | null;
  }[],
): Promise<{ added: number; updated: number }> {
  if (entries.length === 0) return { added: 0, updated: 0 };
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('code', 'booking_com')
    .maybeSingle();
  if (!channel) return { added: 0, updated: 0 };

  let added = 0;
  let updated = 0;
  for (const e of entries) {
    const { data: existing } = await supabase
      .from('pending_reservations')
      .select(
        'id, start_date, end_date, summary, description, status, assigned_booking_id, raw_payload',
      )
      .eq('channel_id', channel.id)
      .eq('external_uid', e.externalUid)
      .maybeSingle();

    if (existing) {
      // Nur pending + noch nicht zugewiesen: Daten/Name nachreichen
      if (
        existing.status !== 'pending' ||
        existing.assigned_booking_id != null ||
        !e.startDate ||
        !e.endDate
      ) {
        continue;
      }
      const dateChanged =
        existing.start_date !== e.startDate || existing.end_date !== e.endDate;
      const newSummary = e.guestName
        ? `Booking-Nr ${e.externalUid} · ${e.guestName}`
        : existing.summary;
      const summaryChanged =
        e.guestName != null &&
        (existing.summary == null || !existing.summary.includes(e.guestName));
      if (!dateChanged && !summaryChanged) continue;

      const prevPayload =
        (existing.raw_payload as Record<string, unknown> | null) ?? {};
      const newPayload = {
        ...prevPayload,
        guestName: e.guestName ?? prevPayload.guestName ?? null,
        bookingDetailUrl: e.bookingDetailUrl ?? prevPayload.bookingDetailUrl ?? null,
        // Tagesuebersicht-Daten kommen direkt von Booking.com — gelten
        // als verifiziert (Phase 22h).
        dates_verified: true,
      };
      const { error: updErr } = await supabase
        .from('pending_reservations')
        .update({
          start_date: e.startDate,
          end_date: e.endDate,
          summary: newSummary,
          raw_payload: newPayload as never,
        })
        .eq('id', existing.id);
      if (updErr) continue;

      await supabase.from('audit_log').insert({
        actor_id: null,
        entity_type: 'pending_reservation',
        entity_id: existing.id,
        action: 'updated',
        diff: {
          start_date: { before: existing.start_date, after: e.startDate },
          end_date: { before: existing.end_date, after: e.endDate },
          summary: { before: existing.summary, after: newSummary },
          _note: 'Backfill aus Tagesübersicht-Mail',
        } as never,
      });
      updated += 1;
      continue;
    }

    // Neu anlegen — wenn Tabellen-Daten da sind, nimm sie; sonst Placeholder
    const today = new Date().toISOString().slice(0, 10);
    const startDate = e.startDate ?? today;
    const endDate = e.endDate ?? addOneDay(startDate);
    const summary = e.guestName
      ? `Booking-Nr ${e.externalUid} · ${e.guestName} (aus Tagesübersicht)`
      : `Booking-Nr ${e.externalUid} (aus Tagesübersicht)`;
    const description =
      'Aus Tagesübersicht-Mail erfasst — Bestätigungs-Mail fehlt.\n' +
      (e.startDate
        ? 'Daten aus Tabellenzeile der Tagesübersicht.\n'
        : 'Bitte im Booking-Extranet Datum und Gast-Namen verifizieren.\n') +
      '\n' +
      (e.bookingDetailUrl ? `Booking-Extranet: ${e.bookingDetailUrl}` : '');
    const { error } = await supabase.from('pending_reservations').insert({
      channel_id: channel.id,
      external_uid: e.externalUid,
      start_date: startDate,
      end_date: endDate,
      summary,
      description,
      status: 'pending',
      raw_payload: {
        source: 'arrivals_summary',
        bookingDetailUrl: e.bookingDetailUrl,
        guestName: e.guestName,
        // True wenn die Tabellenzeile echte Daten lieferte; sonst Placeholder
        // → Mireme muss verifizieren bevor Uebernahme.
        dates_verified: Boolean(e.startDate && e.endDate),
      } as never,
    });
    if (!error) added += 1;
  }
  return { added, updated };
}
