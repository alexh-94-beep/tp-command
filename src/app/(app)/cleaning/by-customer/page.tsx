import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import type { CleaningStatus, CleaningType } from '@/types/aliases';

export const metadata = { title: 'Reinigung nach Kunde' };
export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<CleaningType, string> = {
  checkout: 'Auszug',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Wiederkehrend',
  weekly_clean: 'Wöchentlich',
  weekly_clean_linen: 'Wöchentlich + Bett',
  biweekly_clean: 'Zweiwöchentlich',
  biweekly_clean_linen: 'Zweiwöchentlich + Wäsche',
  monthly_clean: 'Monatlich',
  monthly_clean_linen: 'Monatlich + Wäsche',
  inspection: 'Inspektion',
  special: 'Spezial',
  deep_clean: 'Abnahmereinigung',
};

const STATUS_LABELS: Record<CleaningStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  done: 'Erledigt',
  quality_checked: 'QC ✓',
  cancelled: 'Storniert',
};

const STATUS_TONE: Record<
  CleaningStatus,
  'neutral' | 'warning' | 'info' | 'success' | 'danger'
> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  quality_checked: 'success',
  cancelled: 'neutral',
};

function formatMinutes(min: number | null): string {
  if (min == null || min <= 0) return '–';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h}:${String(m).padStart(2, '0')} h`;
}

interface SearchParams {
  q?: string;
}

export default async function CleaningByCustomerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(['admin', 'office', 'management']);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();

  const supabase = await createSupabaseServerClient();
  const { data: tasks } = await supabase
    .from('cleaning_tasks')
    .select(
      `
      id, scheduled_date, type, status,
      estimated_duration_minutes, actual_duration_minutes,
      apartment:apartments(number),
      external_apartment:external_apartments(label, contact_name),
      stay:subleasing_stays(guest_name, source),
      booking:bookings(
        id,
        tenant:tenants!bookings_tenant_id_fkey(first_name, last_name, company_name, tenant_kind)
      )
    `,
    )
    .order('scheduled_date', { ascending: false })
    .limit(2000);

  // Gruppieren nach abrechenbarem Kunde
  type Group = {
    key: string;
    label: string;
    sub: string | null; // z.B. 'Cityus' / 'Booking' / 'Langzeit'
    tasks: Array<{
      id: string;
      scheduled_date: string;
      type: CleaningType;
      status: CleaningStatus;
      apartment: string;
      estimated: number | null;
      actual: number | null;
    }>;
  };
  const groups = new Map<string, Group>();
  for (const t of tasks ?? []) {
    let key = '';
    let label = '';
    let sub: string | null = null;
    if (t.external_apartment) {
      label = t.external_apartment.contact_name ?? t.external_apartment.label;
      key = `ext:${label}`;
      sub = 'Eigentümer';
    } else if (t.stay) {
      label = t.stay.guest_name;
      key = `stay:${label}`;
      sub = t.stay.source === 'cityus' ? 'Cityus / Bella' : 'Sub-Stay';
    } else if (t.booking?.tenant) {
      const ten = t.booking.tenant;
      label =
        ten.tenant_kind === 'company'
          ? (ten.company_name ?? '–')
          : [ten.first_name, ten.last_name].filter(Boolean).join(' ').trim() || '–';
      key = `bk:${label}`;
      sub = 'Eigene Buchung';
    } else {
      label = 'Ohne Kunden-Verknüpfung';
      key = 'none';
    }

    if (q && !label.toLowerCase().includes(q.toLowerCase())) continue;

    let g = groups.get(key);
    if (!g) {
      g = { key, label, sub, tasks: [] };
      groups.set(key, g);
    }
    g.tasks.push({
      id: t.id,
      scheduled_date: t.scheduled_date,
      type: t.type,
      status: t.status,
      apartment:
        t.apartment?.number ??
        t.external_apartment?.label ??
        '–',
      estimated: t.estimated_duration_minutes,
      actual: t.actual_duration_minutes,
    });
  }

  const sortedGroups = Array.from(groups.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'de'),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/cleaning" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zur Reinigungs-Übersicht
          </span>
        </Link>
      </div>

      <PageHeader
        title="Reinigung nach Kunde"
        description="Alle Reinigungs-Aufträge gruppiert nach Gast / Eigentümer / Mieter, mit der effektiv von Mireme erfassten Zeit für die Abrechnung."
      />

      <form method="get" action="/cleaning/by-customer" className="max-w-md">
        <label className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Suche
        </label>
        <div className="mt-1 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name suchen …"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Suchen
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {sortedGroups.length === 0 ? (
          <Card>
            <CardBody className="px-6 py-8 text-center text-sm text-slate-400">
              Keine Treffer.
            </CardBody>
          </Card>
        ) : (
          sortedGroups.map((g) => {
            const totalEst = g.tasks.reduce(
              (s, t) => s + (t.estimated ?? 0),
              0,
            );
            const totalActual = g.tasks.reduce(
              (s, t) => s + (t.actual ?? 0),
              0,
            );
            return (
              <Card key={g.key}>
                <CardHeader>
                  <CardTitle>
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {g.label}{' '}
                        {g.sub && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {g.sub}
                          </span>
                        )}
                      </span>
                      <span className="text-xs font-normal text-slate-500">
                        {g.tasks.length} Aufträge · Effektiv{' '}
                        <strong>{formatMinutes(totalActual)}</strong>{' '}
                        <span className="text-slate-400">
                          (geschätzt {formatMinutes(totalEst)})
                        </span>
                      </span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardBody className="p-0">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th className="px-3 py-2">Datum</th>
                        <th className="px-3 py-2">Wohnung</th>
                        <th className="px-3 py-2">Typ</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Geschätzt</th>
                        <th className="px-3 py-2 text-right">Effektiv</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {g.tasks.map((t) => (
                        <tr
                          key={t.id}
                          className="cursor-pointer hover:bg-slate-50"
                        >
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Link
                              href={`/cleaning/${t.id}` as never}
                              className="block"
                            >
                              {formatDate(t.scheduled_date)}
                            </Link>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono">
                            <Link
                              href={`/cleaning/${t.id}` as never}
                              className="block"
                            >
                              {t.apartment}
                            </Link>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                            <Link
                              href={`/cleaning/${t.id}` as never}
                              className="block"
                            >
                              {TYPE_LABELS[t.type]}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={STATUS_TONE[t.status]}>
                              {STATUS_LABELS[t.status]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap text-slate-500">
                            {formatMinutes(t.estimated)}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                            {formatMinutes(t.actual)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
