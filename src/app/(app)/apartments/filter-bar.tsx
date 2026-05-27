'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { X } from 'lucide-react';
import { apartmentStatusLabel, apartmentTypeLabel, ownershipLabel } from '@/lib/labels';
import { ChipFilter } from '@/components/ui/chip-filter';

const STATUS_OPTIONS = [
  { value: 'available', label: apartmentStatusLabel.available },
  { value: 'occupied', label: apartmentStatusLabel.occupied },
  { value: 'terminated', label: apartmentStatusLabel.terminated },
  { value: 'contract_pending', label: apartmentStatusLabel.contract_pending },
  { value: 'booking_active', label: apartmentStatusLabel.booking_active },
  { value: 'maintenance', label: apartmentStatusLabel.maintenance },
  { value: 'blocked', label: apartmentStatusLabel.blocked },
] as const;

const TYPE_OPTIONS = [
  { value: 'junior', label: apartmentTypeLabel.junior },
  { value: 'senior', label: apartmentTypeLabel.senior },
  { value: 'suite', label: apartmentTypeLabel.suite },
  { value: 'studio', label: apartmentTypeLabel.studio },
] as const;

const OWNERSHIP_OPTIONS = [
  { value: 'own', label: ownershipLabel.own },
  { value: 'sold_managed', label: ownershipLabel.sold_managed },
  { value: 'sold_external', label: ownershipLabel.sold_external },
] as const;

const BUILDING_OPTIONS = [
  { value: 'C', label: 'Haus C' },
  { value: 'D', label: 'Haus D' },
  { value: 'E', label: 'Haus E' },
] as const;

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function FilterBar({ matchCount }: { matchCount: number }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function updateSearch(value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set('q', value);
    else next.delete('q');
    const q = next.toString();
    startTransition(() => {
      router.replace(q ? `/apartments?${q}` : '/apartments', { scroll: false });
    });
  }

  function reset() {
    startTransition(() => router.replace('/apartments', { scroll: false }));
  }

  const hasFilters = Array.from(sp.keys()).length > 0;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="max-w-md">
        <label className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
          Suche
        </label>
        <input
          className={`mt-1 ${inputCls}`}
          type="search"
          placeholder="Wohnungs-Nr. oder Mieter…"
          defaultValue={sp.get('q') ?? ''}
          onChange={(e) => updateSearch(e.target.value)}
        />
      </div>

      <ChipFilter
        label="Gebäude"
        paramKey="building"
        options={BUILDING_OPTIONS}
        basePath="/apartments"
      />
      <ChipFilter label="Typ" paramKey="type" options={TYPE_OPTIONS} basePath="/apartments" />
      <ChipFilter
        label="Status"
        paramKey="status"
        options={STATUS_OPTIONS}
        basePath="/apartments"
      />
      <ChipFilter
        label="Eigentum"
        paramKey="ownership"
        options={OWNERSHIP_OPTIONS}
        basePath="/apartments"
      />

      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>{pending ? 'Filtere …' : `${matchCount} Treffer`}</span>
        {hasFilters && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
          >
            <X className="h-3 w-3" />
            Alle Filter zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
}
