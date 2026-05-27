'use client';

import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { addDaysIso, todayIso } from '@/lib/dates';
import { apartmentTypeLabel } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { ChipFilter } from '@/components/ui/chip-filter';

const BUILDING_OPTIONS = [
  { value: 'C', label: 'Haus C' },
  { value: 'D', label: 'Haus D' },
  { value: 'E', label: 'Haus E' },
] as const;

const TYPE_OPTIONS = [
  { value: 'junior', label: apartmentTypeLabel.junior },
  { value: 'senior', label: apartmentTypeLabel.senior },
] as const;

const RENTAL_OPTIONS = [
  { value: 'long_term', label: 'Langzeit' },
  { value: 'short_term', label: 'Kurzzeit' },
  { value: 'booking', label: 'Booking & Co.' },
] as const;

const DAYS_PRESETS = [14, 30, 60, 90];

const inputCls =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function CalendarToolbar({ start, days }: { start: string; days: number }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function nav(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    const query = next.toString();
    const href = (query ? `/calendar?${query}` : '/calendar') as Route;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => nav({ start: addDaysIso(start, -days) })}
            disabled={pending}
            title="Zurück"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => nav({ start: todayIso() })}
            disabled={pending}
          >
            <CalendarDays className="h-4 w-4" />
            Heute
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => nav({ start: addDaysIso(start, days) })}
            disabled={pending}
            title="Vor"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="ml-2 flex items-center gap-2 text-sm">
          <label className="text-slate-500">Start</label>
          <input
            type="date"
            value={start}
            onChange={(e) => nav({ start: e.target.value })}
            className={inputCls}
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-500">Tage</label>
          <select
            value={days}
            onChange={(e) => nav({ days: e.target.value })}
            className={inputCls}
          >
            {DAYS_PRESETS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <label className="ml-auto inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={sp.get('showSold') === '1'}
            onChange={(e) => nav({ showSold: e.target.checked ? '1' : '' })}
          />
          Extern verkaufte zeigen
        </label>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <ChipFilter
          label="Gebäude"
          paramKey="building"
          options={BUILDING_OPTIONS}
          basePath="/calendar"
        />
        <ChipFilter label="Typ" paramKey="type" options={TYPE_OPTIONS} basePath="/calendar" />
        <ChipFilter
          label="Mietart"
          paramKey="rental_type"
          options={RENTAL_OPTIONS}
          basePath="/calendar"
        />
      </div>
    </div>
  );
}
