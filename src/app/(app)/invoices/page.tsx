import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { ChipFilter } from '@/components/ui/chip-filter';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { DebitorInvoiceStatus } from '@/types/aliases';
import NewInvoiceButton from './new-invoice-button';

export const metadata = { title: 'Rechnungen' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<DebitorInvoiceStatus, string> = {
  draft: 'Entwurf',
  final: 'Definitiv',
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

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Entwurf' },
  { value: 'final', label: 'Definitiv' },
  { value: 'created', label: 'Erstellt' },
] as const;

interface SearchParams {
  status?: string;
  q?: string;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(['admin', 'office', 'management']);
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const statuses = (sp.status ?? '').split(',').filter(Boolean) as DebitorInvoiceStatus[];

  let query = supabase
    .from('debitor_invoices')
    .select(
      'id, status, last_name, first_name, address, service_date, subject, amount_chf, invoice_number, created_at, finalized_at, invoiced_at, apartment:apartments(number), creator:users!debitor_invoices_created_by_fkey(full_name)',
    )
    .order('created_at', { ascending: false });

  if (statuses.length) query = query.in('status', statuses);

  const { data } = await query;
  let rows = data ?? [];

  // Suche clientseitig (über Name, Betreff, Wohnungs-Nr)
  if (sp.q) {
    const q = sp.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.last_name ?? '').toLowerCase().includes(q) ||
        (r.first_name ?? '').toLowerCase().includes(q) ||
        (r.subject ?? '').toLowerCase().includes(q) ||
        (r.apartment?.number ?? '').toLowerCase().includes(q),
    );
  }

  const drafts = rows.filter((r) => r.status === 'draft').length;
  const finals = rows.filter((r) => r.status === 'final').length;
  const created = rows.filter((r) => r.status === 'created').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rechnungen (Debitoren)"
        description={`${drafts} Entwurf · ${finals} definitiv · ${created} erstellt`}
        actions={<NewInvoiceButton />}
      />

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <ChipFilter
          label="Status"
          paramKey="status"
          options={STATUS_OPTIONS}
          basePath="/invoices"
        />
        <form className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Suche nach Name, Betreff, Wohnungs-Nr…"
            className="block w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
          <Button variant="secondary" size="sm" type="submit">
            Suchen
          </Button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Noch keine Rechnungen"
          description="Erfasse eine neue Rechnung — die Buchhalterin sieht sie sobald du sie auf 'Definitiv' setzt."
        />
      ) : (
        <>
        {/* Mobile: Card-Stack */}
        <div className="space-y-2 md:hidden">
          {rows.map((r) => {
            const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '–';
            return (
              <Link
                key={r.id}
                href={{ pathname: `/invoices/${r.id}` }}
                className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{name}</span>
                      {r.apartment?.number && (
                        <span className="text-xs text-slate-400">
                          · {r.apartment.number}
                        </span>
                      )}
                    </div>
                    {r.subject && (
                      <div className="mt-0.5 truncate text-sm text-slate-700">
                        {r.subject}
                      </div>
                    )}
                    <div className="mt-0.5 text-xs text-slate-500">
                      {formatDate(r.created_at)}
                      {r.amount_chf != null && (
                        <span className="ml-2 tabular-nums">
                          · {formatMoney(Number(r.amount_chf))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    {r.invoice_number && (
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        Nr. {r.invoice_number}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Desktop: Tabelle */}
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-3">Erfasst</th>
                <th className="px-3 py-3">Empfänger</th>
                <th className="px-3 py-3">Wohnung</th>
                <th className="px-3 py-3">Betreff</th>
                <th className="px-3 py-3 text-right">Betrag</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '–';
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                      {formatDate(r.created_at)}
                      {r.creator?.full_name && (
                        <div className="text-[10px] text-slate-400">{r.creator.full_name}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">{name}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium">
                      {r.apartment?.number ?? '–'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="truncate">{r.subject ?? '–'}</div>
                      {r.service_date && (
                        <div className="text-xs text-slate-500">
                          Leistung: {formatDate(r.service_date)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {r.amount_chf != null ? formatMoney(Number(r.amount_chf)) : '–'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      {r.invoice_number && (
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          Nr. {r.invoice_number}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Link
                        href={{ pathname: `/invoices/${r.id}` }}
                        className="text-xs font-medium text-slate-700 hover:underline"
                      >
                        Öffnen →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
