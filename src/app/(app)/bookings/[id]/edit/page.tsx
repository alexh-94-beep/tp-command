import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import EditBookingForm from './edit-form';

export const metadata = { title: 'Buchung bearbeiten' };

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['admin', 'office']);
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('bookings')
    .select(
      `
      id, apartment_id, rental_type, external_reference,
      start_date, end_date, rent_amount, deposit_amount,
      short_term_flat_rate, parking_included, parking_fee,
      contract_status, status, check_in_status, check_out_status, invoiced_via, cleaning_via_ww, notes,
      apartment:apartments(number),
      tenant:tenants!bookings_tenant_id_fkey(first_name, last_name)
    `,
    )
    .eq('id', id)
    .single();

  if (!data) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href={`/bookings/${data.id}`} className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Buchung
          </span>
        </Link>
      </div>

      <PageHeader
        title={`Buchung bearbeiten · ${data.apartment?.number ?? '–'}`}
        description={
          data.tenant
            ? `${data.tenant.first_name ?? ''} ${data.tenant.last_name ?? ''}`.trim() ||
              'Wohnung und Mieter sind nach dem Anlegen fix.'
            : 'Wohnung und Mieter sind nach dem Anlegen fix.'
        }
      />

      <EditBookingForm
        booking={{
          id: data.id,
          rental_type: data.rental_type,
          start_date: data.start_date,
          end_date: data.end_date,
          rent_amount: Number(data.rent_amount),
          deposit_amount: Number(data.deposit_amount),
          short_term_flat_rate:
            data.short_term_flat_rate != null ? Number(data.short_term_flat_rate) : null,
          parking_included: data.parking_included,
          parking_fee: data.parking_fee != null ? Number(data.parking_fee) : null,
          contract_status: data.contract_status,
          status: data.status,
          check_in_status: data.check_in_status,
          check_out_status: data.check_out_status,
          external_reference: data.external_reference,
          invoiced_via: data.invoiced_via,
          cleaning_via_ww: data.cleaning_via_ww,
          notes: data.notes,
        }}
      />
    </div>
  );
}
