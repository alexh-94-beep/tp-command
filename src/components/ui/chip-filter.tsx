'use client';

import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/cn';

/**
 * Mehrfach-Auswahl-Filter als Chip-Toggle-Reihe.
 * URL-State: komma-separierte Werte (z.B. ?status=available,occupied).
 * Server-Pages parsen via `.split(',')` und nutzen `.in()` statt `.eq()`.
 */
export type AllowedFilterPath =
  | '/apartments'
  | '/bookings'
  | '/calendar'
  | '/tenants'
  | '/payments'
  | '/invoices';

interface ChipFilterProps {
  label: string;
  paramKey: string;
  options: readonly { value: string; label: string }[];
  basePath: AllowedFilterPath;
}

export function ChipFilter({ label, paramKey, options, basePath }: ChipFilterProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = sp.get(paramKey) ?? '';
  const activeValues = new Set(current.split(',').filter(Boolean));

  function toggle(value: string) {
    const next = new URLSearchParams(sp.toString());
    const set = new Set(activeValues);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    if (set.size === 0) next.delete(paramKey);
    else next.set(paramKey, Array.from(set).join(','));
    const q = next.toString();
    const href = (q ? `${basePath}?${q}` : basePath) as Route;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="min-w-[80px] text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
        {label}
      </span>
      {options.map((o) => {
        const active = activeValues.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            disabled={pending}
            aria-pressed={active}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition disabled:opacity-60',
              active
                ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
