import { CheckCircle2 } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ChipFilter } from '@/components/ui/chip-filter';
import { formatMoney } from '@/lib/money';
import { rentalTypeLabel } from '@/lib/labels';
import type { PaymentStatus, PaymentType, RentalType } from '@/types/aliases';
import PaymentsList, { type PaymentListRow } from './payments-list';

export const metadata = { title: 'Zahlungen' };
export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = [
  { value: 'overdue', label: 'Überfällig' },
  { value: 'pending', label: 'Offen' },
  { value: 'paid', label: 'Bezahlt' },
  { value: 'cancelled', label: 'Storniert' },
] as const;

const TYPE_OPTIONS = [
  { value: 'rent', label: 'Miete' },
  { value: 'first_rent', label: 'Erst-Miete' },
  { value: 'deposit', label: 'Depot' },
  { value: 'short_term_flat', label: 'Pauschale' },
  { value: 'booking_payout', label: 'Booking-Auszahlung' },
  { value: 'parking', label: 'Parking' },
  { value: 'other', label: 'Sonstige' },
] as const;

const RENTAL_OPTIONS = [
  { value: 'long_term', label: rentalTypeLabel.long_term },
  { value: 'short_term', label: rentalTypeLabel.short_term },
  { value: 'booking', label: rentalTypeLabel.booking },
] as const;

interface SearchParams {
  status?: string;
  type?: string;
  rental_type?: string;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(['admin', 'office']);
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const csv = (s: string | undefined) => (s ?? '').split(',').filter(Boolean);
  const statuses = csv(sp.status) as PaymentStatus[];
  const types = csv(sp.type) as PaymentType[];
  const rentals = csv(sp.rental_type) as RentalType[];

  let query = supabase
    .from('payments')
    .select(
      'id, type, amount, due_date, paid_date, status, method, reference, booking:bookings!inner(id, rental_type, apartment:apartments(number, building), tenant:tenants!bookings_tenant_id_fkey(first_name, last_name))',
    )
    .order('due_date', { ascending: true });

  if (statuses.length) query = query.in('status', statuses);
  if (types.length) query = query.in('type', types);

  const { data, error } = await query;
  // Rental-Type-Filter clientseitig: PostgREST embedded-filter ist nicht typed.
  const filtered = (data ?? []).filter(
    (r) => !rentals.length || (r.booking && rentals.includes(r.booking.rental_type)),
  );

  const rows: PaymentListRow[] = filtered.map((r) => ({
    id: r.id,
    type: r.type,
    amount: Number(r.amount),
    due_date: r.due_date,
    paid_date: r.paid_date,
    status: r.status,
    method: r.method,
    reference: r.reference,
    booking_id: r.booking?.id ?? null,
    apartment_number: r.booking?.apartment?.number ?? null,
    tenant_name: r.booking?.tenant
      ? `${r.booking.tenant.first_name ?? ''} ${r.booking.tenant.last_name ?? ''}`.trim()
      : '–',
  }));

  // Summen
  const sumOpen = rows
    .filter((r) => r.status === 'pending' || r.status === 'overdue')
    .reduce((acc, r) => acc + r.amount, 0);
  const sumOverdue = rows
    .filter((r) => r.status === 'overdue')
    .reduce((acc, r) => acc + r.amount, 0);
  const sumPaid = rows
    .filter((r) => r.status === 'paid')
    .reduce((acc, r) => acc + r.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zahlungen"
        description="Mieten, Depots, Booking-Auszahlungen. Status wird automatisch aus den Einträgen pro Buchung berechnet."
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Fehler beim Laden: {error.message}
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Offen + Überfällig"
          value={formatMoney(sumOpen)}
          tone={sumOpen > 0 ? 'warning' : 'neutral'}
        />
        <SummaryCard
          label="Davon überfällig"
          value={formatMoney(sumOverdue)}
          tone={sumOverdue > 0 ? 'danger' : 'neutral'}
        />
        <SummaryCard
          label="Bezahlt (Filter)"
          value={formatMoney(sumPaid)}
          tone="success"
        />
      </section>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <ChipFilter
          label="Status"
          paramKey="status"
          options={STATUS_OPTIONS}
          basePath="/payments"
        />
        <ChipFilter
          label="Typ"
          paramKey="type"
          options={TYPE_OPTIONS}
          basePath="/payments"
        />
        <ChipFilter
          label="Mietart"
          paramKey="rental_type"
          options={RENTAL_OPTIONS}
          basePath="/payments"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Keine Zahlungen"
          description="Mit den aktuellen Filtern wurde keine Zahlung gefunden."
        />
      ) : (
        <PaymentsList rows={rows} />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const ring =
    tone === 'danger'
      ? 'ring-1 ring-red-200 bg-red-50/30'
      : tone === 'warning'
        ? 'ring-1 ring-amber-200 bg-amber-50/30'
        : tone === 'success'
          ? 'ring-1 ring-emerald-200 bg-emerald-50/30'
          : '';
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 ${ring}`}>
      <div className="flex items-center gap-2 text-slate-500">
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
