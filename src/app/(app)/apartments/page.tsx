import Link from 'next/link';
import { Upload } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/money';
import {
  apartmentStatusLabel,
  apartmentStatusTone,
  apartmentTypeLabel,
  nameTagLabel,
  ownershipLabel,
  ownershipTone,
} from '@/lib/labels';
import type { ApartmentOwnership, ApartmentStatus, ApartmentType } from '@/types/aliases';
import FilterBar from './filter-bar';

export const metadata = { title: 'Wohnungen' };

interface SearchParams {
  q?: string;
  building?: string;
  type?: string;
  status?: string;
  ownership?: string;
}

export default async function ApartmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase.from('apartments').select('*').order('number', { ascending: true });

  // Multi-Select: Werte sind komma-separiert in der URL.
  const csv = (s: string | undefined) => (s ?? '').split(',').filter(Boolean);
  const buildings = csv(sp.building);
  const types = csv(sp.type) as ApartmentType[];
  const statuses = csv(sp.status) as ApartmentStatus[];
  const ownerships = csv(sp.ownership) as ApartmentOwnership[];
  if (buildings.length) query = query.in('building', buildings);
  if (types.length) query = query.in('type', types);
  if (statuses.length) query = query.in('status', statuses);
  if (ownerships.length) query = query.in('ownership', ownerships);
  if (sp.q) {
    const term = sp.q.trim();
    if (term) {
      // Suche in Wohnungsnummer ODER Mieter-Label.
      query = query.or(`number.ilike.%${term}%,current_tenant_label.ilike.%${term}%`);
    }
  }

  const { data: apartments } = await query;
  const list = apartments ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wohnungen"
        description="Stammdaten aller Apartments."
        actions={
          <Link href="/apartments/import">
            <Button variant="secondary">
              <Upload className="h-4 w-4" />
              Aus Excel importieren
            </Button>
          </Link>
        }
      />

      <FilterBar matchCount={list.length} />

      {list.length === 0 ? (
        <EmptyState
          title="Keine Wohnungen gefunden"
          description="Pass die Filter an oder lade die Excel-Liste neu hoch."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Nr.</th>
                <th className="px-4 py-3">Haus</th>
                <th className="px-4 py-3">Typ</th>
                <th className="px-4 py-3">Etage</th>
                <th className="px-4 py-3">m²</th>
                <th className="px-4 py-3">Ausrichtung</th>
                <th className="px-4 py-3">Mieter / Gast</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Eigentum</th>
                <th className="px-4 py-3 text-right">Standardmiete</th>
                <th className="px-4 py-3">Türschild</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    <Link
                      href={`/apartments/${a.id}`}
                      className="text-slate-900 hover:underline"
                    >
                      {a.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{a.building}</td>
                  <td className="px-4 py-3">{apartmentTypeLabel[a.type]}</td>
                  <td className="px-4 py-3">{a.floor ?? '–'}</td>
                  <td className="px-4 py-3">{a.size_sqm ?? '–'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{a.orientation ?? '–'}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-700">
                    {a.current_tenant_label ?? '–'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge tone={apartmentStatusTone[a.status]}>
                      {apartmentStatusLabel[a.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge tone={ownershipTone[a.ownership]}>{ownershipLabel[a.ownership]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatMoney(a.standard_rent)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {nameTagLabel[a.name_tag_status]}
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
