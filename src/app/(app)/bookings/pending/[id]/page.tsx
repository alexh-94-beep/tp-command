import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import PendingDetailActions from './actions';

export const metadata = { title: 'Pool-Reservation' };
export const dynamic = 'force-dynamic';

export default async function PendingReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['admin', 'office', 'cleaning']);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: r } = await supabase
    .from('pending_reservations')
    .select(
      'id, external_uid, start_date, end_date, summary, description, guest_count, status, raw_payload, created_at, assigned_booking_id, channel:channels(code, display_name)',
    )
    .eq('id', id)
    .maybeSingle();

  if (!r) notFound();

  // Booking-Detail-URL aus raw_payload (vom Mail-Parser)
  const rawPayload = (r.raw_payload as Record<string, unknown> | null) ?? {};
  const bookingUrl =
    typeof rawPayload.bookingDetailUrl === 'string'
      ? rawPayload.bookingDetailUrl
      : null;
  // Phase 22h: Bestaetigungs-Mails liefern oft keine Daten — Mireme muss
  // im Booking-Extranet pruefen und Check-out-Datum eintragen bevor die
  // Reservation in eine Buchung uebernommen werden darf.
  const datesVerified = rawPayload.dates_verified === true;

  const statusTone =
    r.status === 'pending'
      ? 'warning'
      : r.status === 'assigned'
        ? 'success'
        : 'danger';
  const statusLabel =
    r.status === 'pending' ? 'Offen' : r.status === 'assigned' ? 'Zugewiesen' : 'Storniert';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/bookings/pending"
          className="text-slate-500 hover:text-slate-700"
        >
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Liste
          </span>
        </Link>
      </div>

      <PageHeader
        title={`Pool-Reservation · ${r.channel?.display_name ?? '–'}`}
        description={`Buchungs-Nr ${r.external_uid}`}
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={statusTone}>{statusLabel}</Badge>
        {r.assigned_booking_id && (
          <Link href={`/bookings/${r.assigned_booking_id}`}>
            <Badge tone="info">Buchung öffnen →</Badge>
          </Link>
        )}
        {bookingUrl && (
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
            <Badge tone="neutral">
              <ExternalLink className="mr-1 inline h-3 w-3" />
              Im Booking-Extranet öffnen
            </Badge>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Aktueller Stand</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <div>
              <span className="text-slate-500">Buchungs-Nr:</span>{' '}
              <span className="font-mono">{r.external_uid}</span>
            </div>
            <div>
              <span className="text-slate-500">Gast:</span>{' '}
              {r.summary ?? (
                <span className="text-slate-400 italic">
                  noch nicht erfasst — im Booking-Extranet ablesen
                </span>
              )}
            </div>
            <div>
              <span className="text-slate-500">Einzug:</span> {formatDate(r.start_date)}
            </div>
            <div>
              <span className="text-slate-500">Auszug:</span> {formatDate(r.end_date)}
            </div>
            <div>
              <span className="text-slate-500">Personen:</span>{' '}
              {r.guest_count ?? '—'}
            </div>
            <div className="text-xs text-slate-400">
              Erfasst {new Date(r.created_at).toLocaleString('de-CH')}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notizen</CardTitle>
          </CardHeader>
          <CardBody>
            {r.description ? (
              <p className="text-sm whitespace-pre-wrap text-slate-700">
                {r.description}
              </p>
            ) : (
              <p className="text-sm text-slate-400">Keine Notizen.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <PendingDetailActions
        reservation={{
          id: r.id,
          start_date: r.start_date,
          end_date: r.end_date,
          summary: r.summary,
          description: r.description,
          guest_count: r.guest_count,
          status: r.status,
          dates_verified: datesVerified,
          booking_detail_url: bookingUrl,
        }}
      />
    </div>
  );
}
