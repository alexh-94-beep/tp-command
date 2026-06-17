import Link from 'next/link';
import { ArrowLeft, Upload } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';

export const metadata = { title: 'Parkplätze' };
export const dynamic = 'force-dynamic';

export default async function ParkingPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireRole(['admin', 'office', 'management', 'cleaning']);
  const params = await searchParams;
  const filter = params.filter ?? 'all';

  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: spots } = await supabase
    .from('parking_spots')
    .select(
      'id, number, building_label, is_booking_pool, is_active, notes_internal, parking_assignments(id, kind, source, tenant_label, start_date, end_date, monthly_rent, is_active, booking_id)',
    )
    .order('number');

  type Row = {
    id: string;
    number: number;
    building_label: string | null;
    is_booking_pool: boolean;
    is_active: boolean;
    notes_internal: string | null;
    current_long_term: string | null;
    current_booking: string | null;
    is_free_today: boolean;
  };

  const rows: Row[] = (spots ?? []).map((s) => {
    const active = (s.parking_assignments ?? []).filter(
      (a) => a.is_active && a.start_date <= today && a.end_date > today,
    );
    const longTerm = active.find((a) => a.kind === 'long_term');
    const booking = active.find((a) => a.kind === 'booking');
    return {
      id: s.id,
      number: s.number,
      building_label: s.building_label,
      is_booking_pool: s.is_booking_pool,
      is_active: s.is_active,
      notes_internal: s.notes_internal,
      current_long_term: longTerm?.tenant_label ?? null,
      current_booking: booking?.tenant_label ?? null,
      is_free_today:
        active.length === 0 ||
        (longTerm == null && booking == null),
    };
  });

  const filtered = rows.filter((r) => {
    if (filter === 'free') return r.is_free_today;
    if (filter === 'booking_pool') return r.is_booking_pool;
    if (filter === 'leerstand') return r.current_long_term == null;
    return true;
  });

  const counts = {
    all: rows.length,
    free: rows.filter((r) => r.is_free_today).length,
    booking_pool: rows.filter((r) => r.is_booking_pool).length,
    leerstand: rows.filter((r) => r.current_long_term == null).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href={{ pathname: '/settings' }} className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zu Einstellungen
          </span>
        </Link>
      </div>

      <PageHeader
        title="Parkplätze"
        description="Tiefgaragen-Stellplätze. W&W-Stand wird per XLS-Import gespiegelt. Booking-Belegungen werden direkt hier gepflegt."
        actions={
          <Link href={{ pathname: '/settings/parking/import' }}>
            <Button>
              <Upload className="h-4 w-4" />
              Mieterspiegel importieren
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ['all', 'Alle', counts.all],
            ['free', 'Heute frei', counts.free],
            ['booking_pool', 'Booking-Pool', counts.booking_pool],
            ['leerstand', 'Leerstand W&W', counts.leerstand],
          ] as const
        ).map(([key, label, count]) => (
          <Link
            key={key}
            href={{
              pathname: '/settings/parking',
              query: key === 'all' ? undefined : { filter: key },
            }}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              filter === key
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {label} ({count})
          </Link>
        ))}
      </div>

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Nr</th>
                  <th className="px-3 py-2">Dauermieter (W&amp;W)</th>
                  <th className="px-3 py-2">Booking-Gast (jetzt)</th>
                  <th className="px-3 py-2">Booking-Pool</th>
                  <th className="px-3 py-2">Notiz</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-semibold">
                      <Link
                        href={`/settings/parking/${r.id}` as never}
                        className="hover:underline"
                      >
                        {r.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {r.current_long_term ?? (
                        <span className="text-xs text-slate-400 italic">
                          Leerstand
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {r.current_booking ? (
                        <Badge tone="warning">{r.current_booking}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.is_booking_pool ? (
                        <Badge tone="info">Pool</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {r.notes_internal ? (
                        <span className="line-clamp-1">{r.notes_internal}</span>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-xs text-slate-500">
                        seit {formatDate(today)} verfügbar
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-sm text-slate-400"
                    >
                      Keine Parkplätze für diesen Filter.
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
