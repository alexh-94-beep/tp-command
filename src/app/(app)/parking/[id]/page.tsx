import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import ParkingSpotActions from './actions';

export const metadata = { title: 'Parkplatz' };
export const dynamic = 'force-dynamic';

export default async function ParkingSpotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['admin', 'office', 'management', 'cleaning']);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: spot } = await supabase
    .from('parking_spots')
    .select(
      'id, number, building_label, is_booking_pool, is_active, notes_internal, created_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (!spot) notFound();

  const { data: assignments } = await supabase
    .from('parking_assignments')
    .select(
      'id, kind, source, tenant_label, external_ref, start_date, end_date, monthly_rent, is_active, notes, booking_id, created_at',
    )
    .eq('parking_spot_id', id)
    .order('start_date', { ascending: false });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href={{ pathname: '/parking' }} className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Liste
          </span>
        </Link>
      </div>

      <PageHeader
        title={`Parkplatz Nr. ${spot.number}`}
        description={spot.building_label ?? '—'}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <div>
              <span className="text-slate-500">Nummer:</span>{' '}
              <span className="font-mono">{spot.number}</span>
            </div>
            <div>
              <span className="text-slate-500">Liegenschaft:</span>{' '}
              {spot.building_label ?? '—'}
            </div>
            <div>
              <span className="text-slate-500">Booking-Pool:</span>{' '}
              {spot.is_booking_pool ? (
                <Badge tone="info">Ja</Badge>
              ) : (
                <Badge tone="neutral">Nein</Badge>
              )}
            </div>
          </CardBody>
        </Card>

        <ParkingSpotActions
          spot={{
            id: spot.id,
            number: spot.number,
            is_booking_pool: spot.is_booking_pool,
            notes_internal: spot.notes_internal,
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Belegungen ({(assignments ?? []).length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Art</th>
                  <th className="px-3 py-2">Mieter / Gast</th>
                  <th className="px-3 py-2">Von</th>
                  <th className="px-3 py-2">Bis</th>
                  <th className="px-3 py-2">Quelle</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(assignments ?? []).map((a) => {
                  const isCurrent =
                    a.is_active && a.start_date <= today && a.end_date > today;
                  return (
                    <tr
                      key={a.id}
                      className={isCurrent ? 'bg-emerald-50/40' : ''}
                    >
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            a.kind === 'long_term'
                              ? 'neutral'
                              : a.kind === 'booking'
                                ? 'warning'
                                : 'info'
                          }
                        >
                          {a.kind === 'long_term'
                            ? 'Dauermiete'
                            : a.kind === 'booking'
                              ? 'Booking'
                              : 'Block'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {a.tenant_label ?? '—'}
                        {a.external_ref && (
                          <span className="ml-1 text-xs text-slate-400">
                            #{a.external_ref}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                        {formatDate(a.start_date)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                        {a.end_date === '2099-12-31'
                          ? 'offen'
                          : formatDate(a.end_date)}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {a.source === 'w_w' ? 'W&W' : 'TP-Command'}
                      </td>
                      <td className="px-3 py-2">
                        {!a.is_active ? (
                          <Badge tone="neutral">archiv</Badge>
                        ) : isCurrent ? (
                          <Badge tone="success">aktiv</Badge>
                        ) : a.start_date > today ? (
                          <Badge tone="info">geplant</Badge>
                        ) : (
                          <Badge tone="neutral">vergangen</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(assignments ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-sm text-slate-400"
                    >
                      Keine Belegungen erfasst.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
