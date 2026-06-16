import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireRole, getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatTime } from '@/lib/dates';
import type { DebitorInvoiceStatus } from '@/types/aliases';
import InvoiceForm, { type ApartmentOption } from './invoice-form';

export const metadata = { title: 'Rechnung' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<DebitorInvoiceStatus, string> = {
  draft: 'Entwurf',
  final: 'Definitiv (bereit für Sharon)',
  created: 'Rechnung erstellt',
};

const STATUS_TONE: Record<
  DebitorInvoiceStatus,
  'neutral' | 'success' | 'warning' | 'info' | 'danger'
> = {
  draft: 'neutral',
  final: 'warning',
  created: 'success',
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['admin', 'office', 'management']);
  const me = await getCurrentUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: inv } = await supabase
    .from('debitor_invoices')
    .select(
      'id, status, last_name, first_name, address, apartment_id, service_date, subject, description, amount_chf, attachment_url, attachment_name, invoice_number, created_at, finalized_at, invoiced_at, apartment:apartments(number, building), creator:users!debitor_invoices_created_by_fkey(full_name), finalizer:users!debitor_invoices_finalized_by_fkey(full_name), invoicer:users!debitor_invoices_invoiced_by_fkey(full_name)',
    )
    .eq('id', id)
    .maybeSingle();
  if (!inv) notFound();

  const { data: aptsRaw } = await supabase
    .from('apartments')
    .select('id, number')
    .neq('ownership', 'sold_external')
    .order('number');
  const apartments: ApartmentOption[] = (aptsRaw ?? []).map((a) => ({
    id: a.id,
    number: a.number,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href={{ pathname: '/invoices' }} className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
          </span>
        </Link>
      </div>

      <PageHeader
        title={inv.subject ?? 'Neue Rechnung'}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>
            {inv.invoice_number && (
              <span className="text-xs">Rechnungs-Nr. {inv.invoice_number}</span>
            )}
            <span className="text-xs">
              Erfasst {formatDate(inv.created_at)} {formatTime(inv.created_at)}
              {inv.creator?.full_name && ` · ${inv.creator.full_name}`}
            </span>
            {inv.finalized_at && (
              <span className="text-xs">
                · Definitiv: {formatDate(inv.finalized_at)}
                {inv.finalizer?.full_name && ` (${inv.finalizer.full_name})`}
              </span>
            )}
            {inv.invoiced_at && (
              <span className="text-xs">
                · Erstellt: {formatDate(inv.invoiced_at)}
                {inv.invoicer?.full_name && ` (${inv.invoicer.full_name})`}
              </span>
            )}
          </span>
        }
      />

      <InvoiceForm
        invoice={{
          id: inv.id,
          status: inv.status,
          last_name: inv.last_name,
          first_name: inv.first_name,
          address: inv.address,
          apartment_id: inv.apartment_id,
          apartment_number: inv.apartment?.number ?? null,
          service_date: inv.service_date,
          subject: inv.subject,
          description: inv.description,
          amount_chf: inv.amount_chf,
          attachment_url: inv.attachment_url,
          attachment_name: inv.attachment_name,
          invoice_number: inv.invoice_number,
        }}
        apartments={apartments}
        canEdit={inv.status === 'draft'}
        canFinalize={inv.status === 'draft'}
        canMarkCreated={inv.status === 'final'}
        canRevert={inv.status === 'final' && (me?.role === 'admin' || me?.role === 'office')}
        canDelete={inv.status !== 'created'}
      />
    </div>
  );
}
