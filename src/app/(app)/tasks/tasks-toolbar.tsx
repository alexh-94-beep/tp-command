'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

const inputCls =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function TasksToolbar({ categories }: { categories: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function nav(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`/tasks?${next.toString()}`, { scroll: false }));
  }

  const range = sp.get('range') ?? 'open';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1 text-xs">
        {[
          { v: 'overdue', label: 'Überfällig' },
          { v: 'today', label: 'Heute' },
          { v: 'week', label: 'Diese Woche' },
          { v: 'month', label: 'Dieser Monat' },
          { v: 'open', label: 'Alle offenen' },
          { v: 'all', label: 'Alle inkl. erledigt' },
        ].map((p) => (
          <button
            key={p.v}
            onClick={() => nav({ range: p.v })}
            className={`rounded-full border px-3 py-1 transition ${
              range === p.v
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label className="text-slate-500">Phase</label>
        <select
          className={inputCls}
          value={sp.get('kind') ?? ''}
          onChange={(e) => nav({ kind: e.target.value })}
        >
          <option value="">Alle</option>
          <option value="move_in">Einzug</option>
          <option value="move_out">Auszug</option>
        </select>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label className="text-slate-500">Mietart</label>
        <select
          className={inputCls}
          value={sp.get('scope') ?? ''}
          onChange={(e) => nav({ scope: e.target.value })}
        >
          <option value="">Alle</option>
          <option value="long_term">Langzeit</option>
          <option value="short_term">Kurzzeit</option>
          <option value="booking">Booking</option>
        </select>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label className="text-slate-500">Kategorie</label>
        <select
          className={inputCls}
          value={sp.get('category') ?? ''}
          onChange={(e) => nav({ category: e.target.value })}
        >
          <option value="">Alle</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <span className="ml-auto text-xs text-slate-400">{pending ? 'Lade …' : ''}</span>
    </div>
  );
}
