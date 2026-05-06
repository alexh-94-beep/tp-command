'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { X } from 'lucide-react';
import {
  apartmentStatusLabel,
  apartmentTypeLabel,
  ownershipLabel,
} from '@/lib/labels';

const STATUSES = [
  'available',
  'occupied',
  'terminated',
  'contract_pending',
  'booking_active',
  'maintenance',
  'blocked',
] as const;
const TYPES = ['junior', 'senior'] as const;
const OWNERSHIPS = ['own', 'sold_managed', 'sold_external'] as const;
const BUILDINGS = ['C', 'D', 'E'] as const;

const labelCls = 'text-xs font-medium uppercase tracking-wide text-slate-500';
const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function FilterBar({ matchCount }: { matchCount: number }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`/apartments?${next.toString()}`, { scroll: false });
    });
  }

  function reset() {
    startTransition(() => router.replace('/apartments', { scroll: false }));
  }

  const hasFilters = Array.from(sp.keys()).length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className={labelCls}>Suche</label>
          <input
            className={inputCls}
            type="search"
            placeholder="Nr. oder Mieter…"
            defaultValue={sp.get('q') ?? ''}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Gebäude</label>
          <select
            className={inputCls}
            value={sp.get('building') ?? ''}
            onChange={(e) => update('building', e.target.value)}
          >
            <option value="">Alle</option>
            {BUILDINGS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Typ</label>
          <select
            className={inputCls}
            value={sp.get('type') ?? ''}
            onChange={(e) => update('type', e.target.value)}
          >
            <option value="">Alle</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {apartmentTypeLabel[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Status</label>
          <select
            className={inputCls}
            value={sp.get('status') ?? ''}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">Alle</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {apartmentStatusLabel[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Eigentum</label>
          <select
            className={inputCls}
            value={sp.get('ownership') ?? ''}
            onChange={(e) => update('ownership', e.target.value)}
          >
            <option value="">Alle</option>
            {OWNERSHIPS.map((o) => (
              <option key={o} value={o}>
                {ownershipLabel[o]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          {pending ? 'Filtere …' : `${matchCount} Treffer`}
        </span>
        {hasFilters && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
          >
            <X className="h-3 w-3" />
            Filter zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
}
