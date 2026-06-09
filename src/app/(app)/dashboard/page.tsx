import Link from 'next/link';
import {
  CalendarDays,
  Sparkles,
  Inbox,
  Home,
  ArrowDownToLine,
  ArrowUpFromLine,
  ListChecks,
  Gauge,
  AlertTriangle,
} from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { getDashboardMetrics } from '@/services/dashboard/metrics';
import { formatDateLong } from '@/lib/dates';

export const metadata = { title: 'Dashboard' };

// Force fresh data on every visit — Kennzahlen sollen aktuell sein.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const m = await getDashboardMetrics(supabase);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Übersicht für ${formatDateLong(m.today)}. Klick auf eine Kachel führt zur Detailliste.`}
      />

      {/* Heute-Zeile: was steht heute an */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          href={{ pathname: '/calendar', query: { date: m.today } }}
          icon={<ArrowDownToLine className="h-5 w-5" />}
          label="Heute Einzug"
          value={m.movements.checkInsToday}
          tone={m.movements.checkInsToday > 0 ? 'success' : 'neutral'}
        />
        <StatCard
          href={{ pathname: '/calendar', query: { date: m.today } }}
          icon={<ArrowUpFromLine className="h-5 w-5" />}
          label="Heute Auszug"
          value={m.movements.checkOutsToday}
          tone={m.movements.checkOutsToday > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          href={{ pathname: '/cleaning/daily', query: { date: m.today } }}
          icon={<Sparkles className="h-5 w-5" />}
          label="Reinigungen heute"
          value={m.cleanings.openToday}
          tone={m.cleanings.openToday > 0 ? 'info' : 'neutral'}
        />
        <StatCard
          href={{ pathname: '/tasks', query: { due: 'today' } }}
          icon={<ListChecks className="h-5 w-5" />}
          label="Aufgaben heute fällig"
          value={m.tasks.dueToday}
          tone={m.tasks.dueToday > 0 ? 'info' : 'neutral'}
        />
      </section>

      {/* Handlungsbedarf-Zeile: Backlog */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-600">Handlungsbedarf</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            href={{ pathname: '/bookings/pending' }}
            icon={<Inbox className="h-5 w-5" />}
            label="Pool-Reservationen offen"
            value={m.pool.pending}
            tone={m.pool.pending > 0 ? 'warning' : 'neutral'}
            description="Booking.com-Anmeldungen, die einer Wohnung zugewiesen werden müssen"
          />
          <StatCard
            href={{ pathname: '/cleaning', query: { overdue: '1' } }}
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Reinigungen überfällig"
            value={m.cleanings.overdue}
            tone={m.cleanings.overdue > 0 ? 'danger' : 'neutral'}
            description="Geplant vor heute, noch nicht erledigt"
          />
          <StatCard
            href={{ pathname: '/tasks', query: { overdue: '1' } }}
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Workflow-Aufgaben überfällig"
            value={m.tasks.overdue}
            tone={m.tasks.overdue > 0 ? 'danger' : 'neutral'}
            description="Fällig vor heute, nicht erledigt"
          />
        </div>
      </section>

      {/* Belegung + Auslastung */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-600">Belegung</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-slate-500">
              <Home className="h-5 w-5" />
              <span className="text-sm">Wohnungen aktuell</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                {m.apartments.occupied}
              </span>
              <span className="text-sm text-slate-400">von {m.apartments.total} belegt</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-2 bg-emerald-500"
                style={{
                  width: `${m.apartments.total ? Math.round((m.apartments.occupied / m.apartments.total) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {m.apartments.free} Wohnung(en) frei
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-slate-500">
              <Gauge className="h-5 w-5" />
              <span className="text-sm">Auslastung {m.occupancy.monthLabel}</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                {m.occupancy.monthPercent}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-2 bg-blue-500"
                style={{ width: `${m.occupancy.monthPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Gewichtete Belegung über alle Wohnungen
            </p>
          </div>

          <Link
            href="/calendar"
            className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="flex items-center gap-2 text-slate-500">
              <CalendarDays className="h-5 w-5" />
              <span className="text-sm">Nächste 7 Tage</span>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Einzüge</span>
                <Badge tone={m.movements.checkInsNext7 > 0 ? 'success' : 'neutral'}>
                  {m.movements.checkInsNext7}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Auszüge</span>
                <Badge tone={m.movements.checkOutsNext7 > 0 ? 'warning' : 'neutral'}>
                  {m.movements.checkOutsNext7}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Reinigungen</span>
                <Badge tone={m.cleanings.openWeek > 0 ? 'info' : 'neutral'}>
                  {m.cleanings.openWeek}
                </Badge>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400 group-hover:text-slate-500">
              Zum Kalender →
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}

type StatCardHref = React.ComponentProps<typeof Link>['href'];

function StatCard({
  href,
  icon,
  label,
  value,
  tone,
  description,
}: {
  href: StatCardHref;
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  description?: string;
}) {
  const ringClass =
    tone === 'success'
      ? 'group-hover:ring-emerald-200'
      : tone === 'warning'
        ? 'group-hover:ring-amber-200'
        : tone === 'danger'
          ? 'group-hover:ring-red-200'
          : tone === 'info'
            ? 'group-hover:ring-blue-200'
            : 'group-hover:ring-slate-200';
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50 hover:ring-4 ${ringClass}`}
    >
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {value > 0 && (
          <Badge tone={tone} className="self-center">
            anzeigen →
          </Badge>
        )}
      </div>
      {description && (
        <p className="mt-2 text-xs text-slate-500">{description}</p>
      )}
    </Link>
  );
}
