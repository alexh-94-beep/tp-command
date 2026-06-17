import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import BookingInboxActions from './actions-panel';

export const metadata = { title: 'Booking-Inbox' };
export const dynamic = 'force-dynamic';

export default async function BookingInboxSettingsPage() {
  await requireRole(['admin']);
  const supabase = await createSupabaseServerClient();

  const { data: recent } = await supabase
    .from('processed_emails')
    .select('id, message_id, subject, action, external_uid, error, processed_at')
    .order('processed_at', { ascending: false })
    .limit(30);

  const counts = { new: 0, cancelled: 0, guest: 0, modified: 0, arrivals: 0, skipped: 0 };
  for (const r of recent ?? []) {
    if (r.action === 'new_reservation') counts.new++;
    else if (r.action === 'cancellation') counts.cancelled++;
    else if (r.action === 'guest_message') counts.guest++;
    else if (r.action === 'booking_modified') counts.modified++;
    else if (r.action === 'arrivals_summary') counts.arrivals++;
    else counts.skipped++;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/settings" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zu Einstellungen
          </span>
        </Link>
      </div>

      <PageHeader
        title="Booking-Inbox"
        description="IMAP-Pull aus info@tp-apartments.ch. Stündlicher Cron. Nur Booking.com-Mails werden verarbeitet."
      />

      <BookingInboxActions />

      <Card>
        <CardHeader>
          <CardTitle>Letzte 30 verarbeitete Mails</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="mb-3 flex gap-2 text-xs">
            <Badge tone="success">{counts.new} neu</Badge>
            <Badge tone="warning">{counts.modified} geändert</Badge>
            <Badge tone="danger">{counts.cancelled} storniert</Badge>
            <Badge tone="info">{counts.guest} Gast-Nachricht</Badge>
            <Badge tone="info">{counts.arrivals} Tagesübersicht</Badge>
            <Badge tone="neutral">{counts.skipped} ignoriert</Badge>
          </div>
          {(recent ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">
              Noch nichts verarbeitet. Manuellen Pull oben starten oder auf den
              nächsten Cron-Lauf warten.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2">Zeitpunkt</th>
                    <th className="px-3 py-2">Aktion</th>
                    <th className="px-3 py-2">Buchungs-Nr</th>
                    <th className="px-3 py-2">Subject</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(recent ?? []).map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                        {new Date(r.processed_at).toLocaleString('de-CH')}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge
                          tone={
                            r.action === 'new_reservation'
                              ? 'success'
                              : r.action === 'cancellation'
                                ? 'danger'
                                : r.action === 'guest_message'
                                  ? 'info'
                                  : r.action === 'booking_modified'
                                    ? 'warning'
                                    : r.action === 'arrivals_summary'
                                      ? 'info'
                                      : 'neutral'
                          }
                        >
                          {r.action === 'new_reservation'
                            ? 'Neu'
                            : r.action === 'cancellation'
                              ? 'Storno'
                              : r.action === 'guest_message'
                                ? 'Gast-Nachricht'
                                : r.action === 'booking_modified'
                                  ? 'Geändert'
                                  : r.action === 'arrivals_summary'
                                    ? 'Tagesübersicht'
                                    : 'Ignoriert'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.external_uid ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        {r.subject ?? '—'}
                        {r.error && (
                          <div className="mt-0.5 text-[10px] text-red-700">
                            {r.error}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Erste Eintragung ab {formatDate(new Date().toISOString().slice(0, 10))} ·
            Mails werden nicht gelöscht oder markiert — Office sieht sie weiterhin
            im Posteingang.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
