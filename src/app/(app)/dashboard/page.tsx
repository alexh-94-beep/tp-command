import Link from 'next/link';
import {
  Home,
  CalendarCheck,
  CalendarX,
  Sparkles,
  CreditCard,
  AlertTriangle,
  ArrowRight,
  ListChecks,
} from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import { cleaningStatusLabel } from '@/lib/labels';
import { getDashboardSections } from '@/services/dashboard/data';
import type { CleaningStatus, DashboardKpis } from '@/types/db';

export const metadata = { title: 'Dashboard · TP-Command' };

const TYPE_LABELS: Record<string, string> = {
  checkout: 'Auszug',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Wiederkehrend',
  weekly_clean: 'Wöchentlich',
  inspection: 'Inspektion',
  special: 'Spezial',
  deep_clean: 'Endreinigung',
};

const STATUS_TONE: Record<CleaningStatus, 'neutral' | 'warning' | 'info' | 'success'> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  quality_checked: 'success',
};

const PRIORITY_TONE: Record<'high' | 'medium' | 'low', 'danger' | 'warning' | 'neutral'> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

async function getKpis(): Promise<DashboardKpis> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from('view_dashboard_kpis').select('*').single();
  if (error || !data) {
    return {
      total_apartments: 0,
      free_apartments: 0,
      occupied_apartments: 0,
      upcoming_checkins: 0,
      upcoming_checkouts: 0,
      open_cleanings: 0,
      open_payments: 0,
      needs_attention: 0,
    };
  }
  return data as DashboardKpis;
}

export default async function DashboardPage() {
  const [kpis, sections] = await Promise.all([getKpis(), getDashboardSections()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">Heutige Übersicht über alle Wohnungen.</p>
      </div>

      {/* KPI-Kacheln */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Freie Wohnungen"
          value={`${kpis.free_apartments} / ${kpis.total_apartments}`}
          icon={Home}
          tone="success"
        />
        <KpiCard label="Belegt" value={kpis.occupied_apartments} icon={Home} />
        <KpiCard label="Einzüge (7 Tage)" value={kpis.upcoming_checkins} icon={CalendarCheck} />
        <KpiCard label="Auszüge (7 Tage)" value={kpis.upcoming_checkouts} icon={CalendarX} />
        <KpiCard
          label="Offene Reinigungen"
          value={kpis.open_cleanings}
          icon={Sparkles}
          tone={kpis.open_cleanings > 0 ? 'warning' : 'neutral'}
        />
        <KpiCard
          label="Offene Zahlungen"
          value={kpis.open_payments}
          icon={CreditCard}
          tone={kpis.open_payments > 0 ? 'warning' : 'neutral'}
        />
        <KpiCard
          label="Handlungsbedarf"
          value={sections.actions.length}
          icon={AlertTriangle}
          tone={sections.actions.length > 0 ? 'danger' : 'neutral'}
        />
      </section>

      {/* Handlungsbedarf */}
      {sections.actions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Handlungsbedarf</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-slate-100">
              {sections.actions.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={PRIORITY_TONE[a.priority]}>
                        {a.priority === 'high' ? 'Wichtig' : a.priority === 'medium' ? 'Mittel' : 'Tief'}
                      </Badge>
                      <span className="text-sm font-medium">{a.title}</span>
                    </div>
                    {a.detail && <div className="ml-1 text-xs text-slate-500">{a.detail}</div>}
                  </div>
                  <Link
                    href={a.href}
                    className="inline-flex items-center gap-1 text-xs text-slate-700 hover:underline"
                  >
                    Öffnen <ArrowRight className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Offene Workflow-Aufgaben */}
      {sections.openTasks.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Offene Aufgaben{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({sections.openTasks.length})
                  </span>
                </span>
              </CardTitle>
              <Link href="/tasks" className="text-xs text-slate-700 hover:underline">
                Alle ansehen →
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            <ul className="divide-y divide-slate-100">
              {sections.openTasks.map((t) => (
                <li key={t.task_id}>
                  <Link
                    href={`/bookings/${t.booking_id}`}
                    className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{t.title}</span>
                        <Badge tone={t.kind === 'move_in' ? 'info' : 'warning'}>
                          {t.kind === 'move_in' ? 'Einzug' : 'Auszug'}
                        </Badge>
                        {t.category && (
                          <span className="text-[10px] uppercase tracking-wide text-slate-400">
                            {t.category}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {t.apartment_number ?? '–'}
                        {t.guest_name && ` · ${t.guest_name}`}
                      </div>
                    </div>
                    <div className="text-right">
                      {t.due_date ? (
                        t.is_overdue ? (
                          <Badge tone="danger">Überfällig · {formatDate(t.due_date)}</Badge>
                        ) : t.days_until_due !== null && t.days_until_due <= 3 ? (
                          <Badge tone="warning">{formatDate(t.due_date)}</Badge>
                        ) : (
                          <span className="text-xs text-slate-500">{formatDate(t.due_date)}</span>
                        )
                      ) : (
                        <span className="text-xs text-slate-400">Kein Fälligkeitsdatum</span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Heute in 3 Spalten */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              Einzüge heute{' '}
              <span className="text-xs font-normal text-slate-500">
                ({sections.checkInsToday.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {sections.checkInsToday.length === 0 ? (
              <p className="text-sm text-slate-400">Keine Einzüge heute.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {sections.checkInsToday.map((r) => (
                  <CheckRow key={r.booking_id} row={r} />
                ))}
              </ul>
            )}
            {sections.checkInsTomorrow.length > 0 && (
              <details className="mt-3 text-xs text-slate-500">
                <summary className="cursor-pointer">
                  Morgen ({sections.checkInsTomorrow.length})
                </summary>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  {sections.checkInsTomorrow.map((r) => (
                    <CheckRow key={r.booking_id} row={r} />
                  ))}
                </ul>
              </details>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Auszüge heute{' '}
              <span className="text-xs font-normal text-slate-500">
                ({sections.checkOutsToday.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {sections.checkOutsToday.length === 0 ? (
              <p className="text-sm text-slate-400">Keine Auszüge heute.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {sections.checkOutsToday.map((r) => (
                  <CheckRow key={r.booking_id} row={r} />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Reinigungen heute{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({sections.cleaningsToday.length})
                </span>
              </CardTitle>
              <Link href="/cleaning/daily" className="text-xs text-slate-700 hover:underline">
                Tagesplan →
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            {sections.cleaningsToday.length === 0 ? (
              <p className="text-sm text-slate-400">Keine Reinigungen heute.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {sections.cleaningsToday.slice(0, 8).map((c) => (
                  <li key={c.task_id}>
                    <Link
                      href={`/cleaning/${c.task_id}`}
                      className="flex items-center justify-between gap-2 hover:underline"
                    >
                      <span>
                        {c.scheduled_time && (
                          <span className="font-medium">{c.scheduled_time} </span>
                        )}
                        <span className="font-medium">{c.apartment_label}</span>
                        <span className="text-slate-500"> · {TYPE_LABELS[c.type] ?? c.type}</span>
                        {c.staff_name && (
                          <span className="text-slate-500"> · {c.staff_name}</span>
                        )}
                      </span>
                      <Badge tone={STATUS_TONE[c.status as CleaningStatus]}>
                        {cleaningStatusLabel[c.status as CleaningStatus]}
                      </Badge>
                    </Link>
                  </li>
                ))}
                {sections.cleaningsToday.length > 8 && (
                  <li className="pt-1 text-xs text-slate-500">
                    + {sections.cleaningsToday.length - 8} weitere
                  </li>
                )}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      {/* Vorschau Woche */}
      {sections.upcomingWeek.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Kommende 7 Tage – Ein- und Auszüge</CardTitle>
              <Link href="/calendar" className="text-xs text-slate-700 hover:underline">
                Belegungs-Kalender →
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-1">Datum</th>
                    <th className="px-2 py-1">Wohnung</th>
                    <th className="px-2 py-1">Mieter / Gast</th>
                    <th className="px-2 py-1">Typ</th>
                    <th className="px-2 py-1">Vertrag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sections.upcomingWeek.slice(0, 20).map((r, i) => (
                    <tr key={`${r.booking_id}-${r.date}-${i}`} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-2 py-1.5">{formatDate(r.date)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 font-medium">
                        <Link href={`/bookings/${r.booking_id}`} className="hover:underline">
                          {r.apartment_number}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5">{r.guest_name}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {r.rental_type}
                        {r.channel && (
                          <span className="ml-1 text-xs text-slate-500">({r.channel})</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <Badge tone={r.contract_status === 'signed' ? 'success' : 'warning'}>
                          {r.contract_status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function CheckRow({ row }: { row: { booking_id: string; apartment_number: string; guest_name: string; channel: string | null } }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <Link
        href={`/bookings/${row.booking_id}`}
        className="flex-1 hover:underline"
      >
        <span className="font-medium">{row.apartment_number}</span>{' '}
        <span className="text-slate-700">{row.guest_name}</span>
      </Link>
      {row.channel && (
        <Badge tone="neutral" className="text-[10px]">
          {row.channel}
        </Badge>
      )}
    </li>
  );
}
