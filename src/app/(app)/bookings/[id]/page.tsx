import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatEndDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { rentalTypeLabel } from '@/lib/labels';
import type {
  BookingPaymentStatus,
  BookingStatus,
  CheckInOutStatus,
  ContractStatus,
} from '@/types/aliases';

export const metadata = { title: 'Buchung' };

const bookingStatusLabel: Record<BookingStatus, string> = {
  planned: 'Geplant',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
};
const bookingStatusTone: Record<
  BookingStatus,
  'neutral' | 'success' | 'warning' | 'info' | 'danger'
> = {
  planned: 'warning',
  active: 'success',
  completed: 'neutral',
  cancelled: 'danger',
};
const contractStatusLabel: Record<ContractStatus, string> = {
  draft: 'Entwurf',
  sent: 'Versendet',
  signed: 'Unterschrieben',
  cancelled: 'Abgesagt',
};
const checkLabel: Record<CheckInOutStatus, string> = {
  pending: 'Offen',
  completed: 'Erledigt',
};
const paymentLabel: Record<BookingPaymentStatus, string> = {
  pending: 'Offen',
  partial: 'Teilweise',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
};
const paymentTone: Record<BookingPaymentStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  pending: 'neutral',
  partial: 'warning',
  paid: 'success',
  overdue: 'danger',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value ?? '–'}</dd>
    </div>
  );
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: b } = await supabase
    .from('bookings')
    .select(
      `
      id, apartment_id, rental_type, external_reference,
      start_date, end_date, rent_amount, deposit_amount,
      short_term_flat_rate, parking_included, parking_fee,
      contract_status, payment_status, check_in_status, check_out_status,
      status, notes,
      apartment:apartments(id, number, building, type),
      tenant:tenants!bookings_tenant_id_fkey(id, first_name, last_name, email, phone),
      channel:channels(display_name)
    `,
    )
    .eq('id', id)
    .single();

  if (!b) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/bookings" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Buchungsliste
          </span>
        </Link>
      </div>

      <PageHeader
        title={`Buchung · ${b.apartment?.number ?? '–'}`}
        description={`${rentalTypeLabel[b.rental_type]} · ${formatDate(b.start_date)} – ${formatEndDate(b.end_date)}`}
        actions={
          <Link href={`/bookings/${b.id}/edit`}>
            <Button>
              <Pencil className="h-4 w-4" />
              Bearbeiten
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={bookingStatusTone[b.status]}>{bookingStatusLabel[b.status]}</Badge>
        <Badge tone="info">Vertrag: {contractStatusLabel[b.contract_status]}</Badge>
        <Badge tone={paymentTone[b.payment_status]}>Zahlung: {paymentLabel[b.payment_status]}</Badge>
        <Badge tone="neutral">Check-in: {checkLabel[b.check_in_status]}</Badge>
        <Badge tone="neutral">Check-out: {checkLabel[b.check_out_status]}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Wohnung &amp; Mieter</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Field
                label="Wohnung"
                value={
                  b.apartment ? (
                    <Link href={`/apartments/${b.apartment.id}`} className="hover:underline">
                      {b.apartment.number}
                    </Link>
                  ) : (
                    '–'
                  )
                }
              />
              <Field label="Gebäude" value={b.apartment?.building} />
              <Field
                label="Mieter / Gast"
                value={
                  b.tenant
                    ? `${b.tenant.first_name ?? ''} ${b.tenant.last_name ?? ''}`.trim() || '–'
                    : '–'
                }
              />
              <Field label="E-Mail" value={b.tenant?.email} />
              <Field label="Telefon" value={b.tenant?.phone} />
              <Field label="Channel" value={b.channel?.display_name} />
              <Field label="Externe Referenz" value={b.external_reference} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Konditionen</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Field label="Mietart" value={rentalTypeLabel[b.rental_type]} />
              <Field label="Mietzins" value={formatMoney(b.rent_amount)} />
              <Field label="Depot" value={formatMoney(b.deposit_amount)} />
              <Field label="Kurzzeitpauschale" value={formatMoney(b.short_term_flat_rate)} />
              <Field
                label="Parking"
                value={b.parking_included ? `Inkl. (${formatMoney(b.parking_fee)})` : 'Nein'}
              />
            </dl>
          </CardBody>
        </Card>

        {b.notes && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm whitespace-pre-wrap text-slate-700">{b.notes}</p>
            </CardBody>
          </Card>
        )}
      </div>

      {/*
        Workflow-Aufgaben (Phase 4: workflow-engine) und Übergabe/Abnahme-
        Sections (Phase 8: handover) werden hier in späteren Phasen ergänzt.
      */}
    </div>
  );
}
