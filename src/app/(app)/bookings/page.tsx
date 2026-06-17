import Link from 'next/link';
import { Inbox, Pencil, Plus, Upload } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChipFilter } from '@/components/ui/chip-filter';
import { formatDate, formatEndDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { rentalTypeLabel } from '@/lib/labels';
import type { BookingStatus, RentalType } from '@/types/aliases';

const STATUS_OPTIONS = [
  { value: 'planned', label: 'Geplant' },
  { value: 'active', label: 'Aktiv' },
  { value: 'completed', label: 'Abgeschlossen' },
  { value: 'cancelled', label: 'Storniert' },
] as const;

const RENTAL_OPTIONS = [
  { value: 'long_term', label: rentalTypeLabel.long_term },
  { value: 'short_term', label: rentalTypeLabel.short_term },
  { value: 'booking', label: rentalTypeLabel.booking },
] as const;

export const metadata = { title: 'Buchungen' };

const statusLabel: Record<BookingStatus, string> = {
  planned: 'Geplant',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
};

const statusTone: Record<BookingStatus, 'neutral' | 'success' | 'warning' | 'info' | 'danger'> = {
  planned: 'warning',
  active: 'success',
  completed: 'neutral',
  cancelled: 'danger',
};

interface SearchParams {
  status?: string;
  rental_type?: string;
  /** Drill-Down vom Dashboard: in_today / out_today / in_week / out_week */
  event?: 'in_today' | 'out_today' | 'in_week' | 'out_week';
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  // Pool-Reservationen ohne Wohnungs-Zuweisung — Banner oben anzeigen
  const { count: pendingCount } = await supabase
    .from('pending_reservations')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  let query = supabase
    .from('bookings')
    .select(
      'id, start_date, end_date, rent_amount, status, rental_type, apartment:apartments(number), tenant:tenants!bookings_tenant_id_fkey(first_name, last_name)',
    )
    .order('start_date', { ascending: false });

  const csv = (s: string | undefined) => (s ?? '').split(',').filter(Boolean);
  const statuses = csv(sp.status) as BookingStatus[];
  const rentals = csv(sp.rental_type) as RentalType[];
  if (statuses.length) query = query.in('status', statuses);
  if (rentals.length) query = query.in('rental_type', rentals);

  // Drill-Down vom Dashboard: nur Buchungen mit Einzug/Auszug am Tag/Woche
  const today = new Date().toISOString().slice(0, 10);
  const next7 = new Date();
  next7.setDate(next7.getDate() + 7);
  const next7Iso = next7.toISOString().slice(0, 10);
  if (sp.event === 'in_today') {
    query = query.in('status', ['planned', 'active']).eq('start_date', today);
  } else if (sp.event === 'out_today') {
    query = query.in('status', ['planned', 'active']).eq('end_date', today);
  } else if (sp.event === 'in_week') {
    query = query
      .in('status', ['planned', 'active'])
      .gte('start_date', today)
      .lte('start_date', next7Iso);
  } else if (sp.event === 'out_week') {
    query = query
      .in('status', ['planned', 'active'])
      .gte('end_date', today)
      .lte('end_date', next7Iso);
  }

  // Phase 19: Limit 500 — schuetzt vor unbeabsichtigtem Full-Scan
  const { data } = await query.limit(500);
  const rows = data ?? [];

  const eventLabel: Record<NonNullable<SearchParams['event']>, string> = {
    in_today: 'Einzüge heute',
    out_today: 'Auszüge heute',
    in_week: 'Einzüge nächste 7 Tage',
    out_week: 'Auszüge nächste 7 Tage',
  };

  return (
    <div className="space-y-6">
      {pendingCount && pendingCount > 0 ? (
        <Link
          href="/bookings/pending"
          className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span className="inline-flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            <strong>{pendingCount}</strong> offene Pool-Reservation(en) warten auf
            Wohnungs-Zuweisung
          </span>
          <span className="text-xs">Jetzt ansehen →</span>
        </Link>
      ) : null}

      {sp.event ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Gefilterte Liste: <strong>{eventLabel[sp.event]}</strong> ·{' '}
          <Link href="/bookings" className="underline">
            Filter entfernen
          </Link>
        </div>
      ) : null}

      <PageHeader
        title="Buchungen"
        description={
          sp.event
            ? eventLabel[sp.event]
            : 'Mietverhältnisse aller Arten: Langzeit, Kurzzeit, Booking.'
        }
        actions={
          <div className="flex gap-2">
            <Link href="/bookings/flatfox">
              <Button variant="secondary">
                <Upload className="h-4 w-4" />
                Aus Flatfox importieren
              </Button>
            </Link>
            <Link href="/bookings/new">
              <Button>
                <Plus className="h-4 w-4" />
                Neue Buchung
              </Button>
            </Link>
          </div>
        }
      />

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <ChipFilter
          label="Status"
          paramKey="status"
          options={STATUS_OPTIONS}
          basePath="/bookings"
        />
        <ChipFilter
          label="Mietart"
          paramKey="rental_type"
          options={RENTAL_OPTIONS}
          basePath="/bookings"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Noch keine Buchungen"
          description="Lege die erste Buchung an oder ändere die Filter."
          action={
            <Link href="/bookings/new">
              <Button>
                <Plus className="h-4 w-4" />
                Neue Buchung
              </Button>
            </Link>
          }
        />
      ) : (
        <>
        {/* Mobile: Card-Stack */}
        <div className="space-y-2 md:hidden">
          {rows.map((b) => (
            <Link
              key={b.id}
              href={`/bookings/${b.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">
                      {b.apartment?.number ?? '–'}
                    </span>
                    <Badge tone="neutral">{rentalTypeLabel[b.rental_type]}</Badge>
                  </div>
                  <div className="mt-0.5 text-sm text-slate-700">
                    {b.tenant
                      ? `${b.tenant.first_name ?? ''} ${b.tenant.last_name ?? ''}`.trim()
                      : '—'}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {formatDate(b.start_date)} → {formatEndDate(b.end_date)}
                    {' · '}
                    {formatMoney(b.rent_amount)}
                  </div>
                </div>
                <Badge tone={statusTone[b.status]}>{statusLabel[b.status]}</Badge>
              </div>
            </Link>
          ))}
        </div>

        {/* Desktop: Tabelle */}
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Wohnung</th>
                <th className="px-4 py-3">Mieter / Gast</th>
                <th className="px-4 py-3">Mietart</th>
                <th className="px-4 py-3">Einzug</th>
                <th className="px-4 py-3">Auszug</th>
                <th className="px-4 py-3 text-right">Mietzins</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((b) => (
                <tr key={b.id} className="group hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    <Link href={`/bookings/${b.id}`} className="hover:underline">
                      {b.apartment?.number ?? '–'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {b.tenant ? `${b.tenant.first_name ?? ''} ${b.tenant.last_name ?? ''}`.trim() : '–'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{rentalTypeLabel[b.rental_type]}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(b.start_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatEndDate(b.end_date)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatMoney(b.rent_amount)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge tone={statusTone[b.status]}>{statusLabel[b.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/bookings/${b.id}/edit`}
                      title="Bearbeiten"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Pencil className="h-3 w-3" />
                      Bearbeiten
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

