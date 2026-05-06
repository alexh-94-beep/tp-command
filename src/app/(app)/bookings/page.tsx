import Link from 'next/link';
import { Inbox, Pencil, Plus, Upload } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatEndDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { rentalTypeLabel } from '@/lib/labels';
import type { BookingStatus, RentalType } from '@/types/db';

export const metadata = { title: 'Buchungen · TP-Command' };

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

interface BookingRow {
  id: string;
  start_date: string;
  end_date: string;
  rent_amount: number;
  status: BookingStatus;
  rental_type: RentalType;
  apartment: { number: string } | null;
  tenant: { first_name: string; last_name: string } | null;
}

interface SearchParams {
  status?: string;
  rental_type?: string;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createSupabaseServerClient();

  // Pending-Reservationen zählen (für Banner)
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

  if (searchParams.status) query = query.eq('status', searchParams.status);
  if (searchParams.rental_type) query = query.eq('rental_type', searchParams.rental_type);

  const { data } = await query;
  const rows = (data ?? []) as unknown as BookingRow[];

  return (
    <div className="space-y-6">
      {pendingCount && pendingCount > 0 ? (
        <Link
          href="/bookings/pending"
          className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span className="inline-flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            <strong>{pendingCount}</strong> offene Pool-Reservation(en) warten auf Wohnungs-Zuweisung
          </span>
          <span className="text-xs">Jetzt ansehen →</span>
        </Link>
      ) : null}

      <PageHeader
        title="Buchungen"
        description="Mietverhältnisse aller Arten: Langzeit, Kurzzeit, Booking."
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

      {/* Mini-Filter (stateless, URL-basiert) */}
      <div className="flex flex-wrap gap-2 text-xs">
        <FilterPill href="/bookings" active={!searchParams.status && !searchParams.rental_type}>
          Alle
        </FilterPill>
        <FilterPill href="/bookings?status=active" active={searchParams.status === 'active'}>
          Aktiv
        </FilterPill>
        <FilterPill href="/bookings?status=planned" active={searchParams.status === 'planned'}>
          Geplant
        </FilterPill>
        <FilterPill
          href="/bookings?rental_type=long_term"
          active={searchParams.rental_type === 'long_term'}
        >
          Langzeit
        </FilterPill>
        <FilterPill
          href="/bookings?rental_type=short_term"
          active={searchParams.rental_type === 'short_term'}
        >
          Kurzzeit
        </FilterPill>
        <FilterPill
          href="/bookings?rental_type=booking"
          active={searchParams.rental_type === 'booking'}
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
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
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
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    <Link href={`/bookings/${b.id}`} className="hover:underline">
                      {b.apartment?.number ?? '–'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/bookings/${b.id}`} className="block hover:underline">
                      {b.tenant ? `${b.tenant.first_name} ${b.tenant.last_name}` : '–'}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/bookings/${b.id}`} className="block">
                      {rentalTypeLabel[b.rental_type]}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/bookings/${b.id}`} className="block">
                      {formatDate(b.start_date)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/bookings/${b.id}`} className="block">
                      {formatEndDate(b.end_date)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link href={`/bookings/${b.id}`} className="block">
                      {formatMoney(b.rent_amount)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/bookings/${b.id}`} className="block">
                      <Badge tone={statusTone[b.status]}>{statusLabel[b.status]}</Badge>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      href={`/bookings/${b.id}/edit`}
                      title="Bearbeiten"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 opacity-0 transition hover:bg-slate-100 hover:text-slate-900 group-hover:opacity-100"
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
  href: string;
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
