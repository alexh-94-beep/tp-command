import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatEndDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { rentalTypeLabel } from '@/lib/labels';
import type { BookingStatus, RentalType, TenantKind } from '@/types/aliases';

export const metadata = { title: 'Mieter / Gast' };
export const dynamic = 'force-dynamic';

const kindLabel: Record<TenantKind, string> = {
  tenant: 'Mieter',
  guest: 'Gast',
  company: 'Firma',
};
const kindTone: Record<TenantKind, 'info' | 'neutral' | 'warning'> = {
  tenant: 'info',
  guest: 'neutral',
  company: 'warning',
};
const bookingStatusLabel: Record<BookingStatus, string> = {
  planned: 'Geplant',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
};
const bookingStatusTone: Record<
  BookingStatus,
  'neutral' | 'success' | 'warning' | 'danger'
> = {
  planned: 'warning',
  active: 'success',
  completed: 'neutral',
  cancelled: 'danger',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value ?? '–'}</dd>
    </div>
  );
}

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: t } = await supabase
    .from('tenants')
    .select(
      'id, tenant_kind, first_name, last_name, company_name, email, phone, source, address, notes',
    )
    .eq('id', id)
    .maybeSingle();
  if (!t) notFound();

  const { data: bookings } = await supabase
    .from('bookings')
    .select(
      'id, rental_type, start_date, end_date, status, rent_amount, apartment:apartments(id, number)',
    )
    .eq('tenant_id', id)
    .order('start_date', { ascending: false });

  const displayName =
    t.tenant_kind === 'company'
      ? (t.company_name ?? '–')
      : [t.first_name, t.last_name].filter(Boolean).join(' ') || '–';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/tenants" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Liste
          </span>
        </Link>
      </div>

      <PageHeader
        title={displayName}
        description={`${kindLabel[t.tenant_kind]} · ${t.source ?? '–'}`}
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={kindTone[t.tenant_kind]}>{kindLabel[t.tenant_kind]}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-3">
            <Field label="Name" value={displayName} />
            <Field label="E-Mail" value={t.email} />
            <Field label="Telefon" value={t.phone} />
            <Field label="Adresse" value={t.address} />
            <Field label="Quelle" value={t.source} />
            {t.notes && (
              <div className="col-span-full">
                <Field label="Notizen" value={t.notes} />
              </div>
            )}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buchungen ({(bookings ?? []).length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {(bookings ?? []).length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-500">
              Noch keine Buchungen erfasst.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2">Typ</th>
                    <th className="px-3 py-2">Wohnung</th>
                    <th className="px-3 py-2">Einzug</th>
                    <th className="px-3 py-2">Auszug</th>
                    <th className="px-3 py-2">Mietzins</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(bookings ?? []).map((b) => {
                    const rt = b.rental_type as RentalType;
                    const st = b.status as BookingStatus;
                    const href = `/bookings/${b.id}` as const;
                    return (
                      <tr key={b.id} className="cursor-pointer hover:bg-slate-50">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Link href={href as never} className="block">
                            <Badge tone="info">{rentalTypeLabel[rt]}</Badge>
                          </Link>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">
                          <Link href={href as never} className="block hover:underline">
                            {b.apartment?.number ?? '–'}
                          </Link>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                          <Link href={href as never} className="block">
                            {formatDate(b.start_date)}
                          </Link>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                          <Link href={href as never} className="block">
                            {formatEndDate(b.end_date)}
                          </Link>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                          <Link href={href as never} className="block">
                            {rt === 'booking' ? '—' : formatMoney(b.rent_amount)}
                          </Link>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Link href={href as never} className="block">
                            <Badge tone={bookingStatusTone[st]}>
                              {bookingStatusLabel[st]}
                            </Badge>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
