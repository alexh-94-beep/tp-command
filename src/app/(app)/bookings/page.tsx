import Link from 'next/link';
import { Pencil, Plus } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatEndDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { rentalTypeLabel } from '@/lib/labels';
import type { BookingStatus } from '@/types/aliases';

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
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('bookings')
    .select(
      'id, start_date, end_date, rent_amount, status, rental_type, apartment:apartments(number), tenant:tenants!bookings_tenant_id_fkey(first_name, last_name)',
    )
    .order('start_date', { ascending: false });

  if (sp.status) query = query.eq('status', sp.status as BookingStatus);
  if (sp.rental_type)
    query = query.eq('rental_type', sp.rental_type as 'long_term' | 'short_term' | 'booking');

  const { data } = await query;
  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buchungen"
        description="Mietverhältnisse aller Arten: Langzeit, Kurzzeit, Booking."
        actions={
          <Link href="/bookings/new">
            <Button>
              <Plus className="h-4 w-4" />
              Neue Buchung
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <FilterPill href="/bookings" active={!sp.status && !sp.rental_type}>
          Alle
        </FilterPill>
        <FilterPill href="/bookings?status=active" active={sp.status === 'active'}>
          Aktiv
        </FilterPill>
        <FilterPill href="/bookings?status=planned" active={sp.status === 'planned'}>
          Geplant
        </FilterPill>
        <FilterPill
          href="/bookings?rental_type=long_term"
          active={sp.rental_type === 'long_term'}
        >
          Langzeit
        </FilterPill>
        <FilterPill
          href="/bookings?rental_type=short_term"
          active={sp.rental_type === 'short_term'}
        >
          Kurzzeit
        </FilterPill>
        <FilterPill
          href="/bookings?rental_type=booking"
          active={sp.rental_type === 'booking'}
        >
          Booking
        </FilterPill>
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
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
      )}
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href:
    | '/bookings'
    | '/bookings?status=active'
    | '/bookings?status=planned'
    | '/bookings?rental_type=long_term'
    | '/bookings?rental_type=short_term'
    | '/bookings?rental_type=booking';
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 transition ${
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </Link>
  );
}
