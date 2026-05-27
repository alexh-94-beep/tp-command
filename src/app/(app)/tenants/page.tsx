import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { ChipFilter } from '@/components/ui/chip-filter';
import type { TenantKind } from '@/types/aliases';

const KIND_OPTIONS = [
  { value: 'tenant', label: 'Mieter' },
  { value: 'guest', label: 'Gast' },
  { value: 'company', label: 'Firma' },
] as const;

export const metadata = { title: 'Mieter & Gäste' };

interface SearchParams {
  kind?: string;
  q?: string;
}

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

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('tenants')
    .select(
      'id, tenant_kind, first_name, last_name, company_name, email, phone, source, bookings:bookings!bookings_tenant_id_fkey(count)',
    )
    .order('last_name', { ascending: true, nullsFirst: false });

  const kinds = (sp.kind ?? '')
    .split(',')
    .filter((v): v is TenantKind => v === 'tenant' || v === 'guest' || v === 'company');
  if (kinds.length) query = query.in('tenant_kind', kinds);
  if (sp.q) {
    const term = sp.q.trim();
    if (term) {
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,company_name.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }
  }

  const { data: tenants } = await query;
  const rows = tenants ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mieter & Gäste"
        description="Personen und Firmen, die mit einer Buchung verknüpft sind. Anlegen geschieht beim Erstellen einer Buchung."
      />

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <form method="get" action="/tenants" className="max-w-md">
          {/* preserve kind state when submitting search */}
          {kinds.length > 0 && <input type="hidden" name="kind" value={kinds.join(',')} />}
          <label className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
            Suche
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ''}
              placeholder="Name, E-Mail oder Firma…"
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Suchen
            </button>
          </div>
        </form>
        <ChipFilter
          label="Art"
          paramKey="kind"
          options={KIND_OPTIONS}
          basePath="/tenants"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Keine Mieter / Gäste gefunden"
          description="Lege eine Buchung an, dann erscheint der zugehörige Mieter hier."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Art</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">E-Mail</th>
                <th className="px-4 py-3">Telefon</th>
                <th className="px-4 py-3">Quelle</th>
                <th className="px-4 py-3 text-right">Buchungen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => {
                const displayName =
                  t.tenant_kind === 'company'
                    ? (t.company_name ?? '–')
                    : [t.first_name, t.last_name].filter(Boolean).join(' ') || '–';
                const bookingCount = Array.isArray(t.bookings)
                  ? (t.bookings[0]?.count ?? 0)
                  : 0;
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge tone={kindTone[t.tenant_kind]}>{kindLabel[t.tenant_kind]}</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{displayName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{t.email ?? '–'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{t.phone ?? '–'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {t.source ?? '–'}
                    </td>
                    <td className="px-4 py-3 text-right">{bookingCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
