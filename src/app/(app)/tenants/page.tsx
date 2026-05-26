import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import type { TenantKind } from '@/types/aliases';

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

  if (sp.kind === 'tenant' || sp.kind === 'guest' || sp.kind === 'company') {
    query = query.eq('tenant_kind', sp.kind);
  }
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

      <form
        method="get"
        action="/tenants"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="grow">
          <label className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Suche
          </label>
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Name, E-Mail oder Firma…"
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium tracking-wide text-slate-500 uppercase">Art</label>
          <select
            name="kind"
            defaultValue={sp.kind ?? ''}
            className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
          >
            <option value="">Alle</option>
            <option value="tenant">Mieter</option>
            <option value="guest">Gast</option>
            <option value="company">Firma</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Filtern
        </button>
      </form>

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
