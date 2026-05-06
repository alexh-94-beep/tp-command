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
import HandoverSection from './handover-section';
import BookingTasksSection, { type BookingTaskRow } from './booking-tasks-section';
import type {
  BookingPaymentStatus,
  BookingStatus,
  CheckInOutStatus,
  ContractStatus,
  RentalType,
} from '@/types/db';

export const metadata = { title: 'Buchung · TP-Command' };

const bookingStatusLabel: Record<BookingStatus, string> = {
  planned: 'Geplant',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
};
const bookingStatusTone: Record<BookingStatus, 'neutral' | 'success' | 'warning' | 'info' | 'danger'> = {
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
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value ?? '–'}</dd>
    </div>
  );
}

interface BookingDetail {
  id: string;
  apartment_id: string;
  rental_type: RentalType;
  external_reference: string | null;
  start_date: string;
  end_date: string;
  rent_amount: number;
  deposit_amount: number;
  short_term_flat_rate: number | null;
  parking_included: boolean;
  parking_fee: number | null;
  contract_status: ContractStatus;
  payment_status: BookingPaymentStatus;
  check_in_status: CheckInOutStatus;
  check_out_status: CheckInOutStatus;
  status: BookingStatus;
  notes: string | null;
  handover_planned_at: string | null;
  handover_completed_at: string | null;
  move_in_planned_at: string | null;
  move_in_completed_at: string | null;
  apartment: { id: string; number: string; building: string; type: string } | null;
  tenant: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  channel: { display_name: string } | null;
  handover_user: { full_name: string } | null;
  move_in_user: { full_name: string } | null;
}

export default async function BookingDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data } = await supabase
    .from('bookings')
    .select(
      `
      id, apartment_id, rental_type, external_reference,
      start_date, end_date, rent_amount, deposit_amount,
      short_term_flat_rate, parking_included, parking_fee,
      contract_status, payment_status, check_in_status, check_out_status,
      status, notes, handover_planned_at, handover_completed_at,
      move_in_planned_at, move_in_completed_at,
      apartment:apartments(id, number, building, type),
      tenant:tenants!bookings_tenant_id_fkey(id, first_name, last_name, email, phone),
      channel:channels(display_name),
      handover_user:users!bookings_handover_by_fkey(full_name),
      move_in_user:users!bookings_move_in_by_fkey(full_name)
    `,
    )
    .eq('id', params.id)
    .single();

  if (!data) notFound();
  const b = data as unknown as BookingDetail;

  // Aufgaben laden
  const { data: rawTasks } = await supabase
    .from('booking_tasks')
    .select(
      `
      id, kind, position, code, title, description, category,
      due_date, status, is_optional, is_conditional, notes,
      template_task_id, completed_at,
      completed_by_user:users!booking_tasks_completed_by_fkey(full_name)
    `,
    )
    .eq('booking_id', b.id)
    .order('kind', { ascending: true })
    .order('position', { ascending: true });

  const tasks: BookingTaskRow[] = (rawTasks ?? []).map((r) => {
    const cb = r.completed_by_user as unknown as { full_name: string } | null;
    return {
      id: r.id as string,
      kind: r.kind as 'move_in' | 'move_out',
      position: r.position as number,
      code: r.code as string | null,
      title: r.title as string,
      description: r.description as string | null,
      category: r.category as string | null,
      due_date: r.due_date as string | null,
      status: r.status as BookingTaskRow['status'],
      is_optional: !!r.is_optional,
      is_conditional: !!r.is_conditional,
      notes: r.notes as string | null,
      template_task_id: r.template_task_id as string | null,
      completed_at: r.completed_at as string | null,
      completed_by_name: cb?.full_name ?? null,
    };
  });

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
            <CardTitle>Wohnung & Mieter</CardTitle>
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
                value={b.tenant ? `${b.tenant.first_name} ${b.tenant.last_name}` : '–'}
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
              <p className="whitespace-pre-wrap text-sm text-slate-700">{b.notes}</p>
            </CardBody>
          </Card>
        )}
      </div>

      <HandoverSection
        bookingId={b.id}
        rentalType={b.rental_type}
        moveInPlannedAt={b.move_in_planned_at}
        moveInCompletedAt={b.move_in_completed_at}
        moveInByName={b.move_in_user?.full_name ?? null}
        handoverPlannedAt={b.handover_planned_at}
        handoverCompletedAt={b.handover_completed_at}
        handoverByName={b.handover_user?.full_name ?? null}
      />

      <BookingTasksSection bookingId={b.id} tasks={tasks} />
    </div>
  );
}
