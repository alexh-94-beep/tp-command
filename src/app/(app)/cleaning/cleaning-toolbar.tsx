'use client';

import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

const inputCls =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

const RANGE_PRESETS = [
  { v: 'open', label: 'Offen / aktiv' },
  { v: 'today', label: 'Heute' },
  { v: 'week', label: 'Woche' },
  { v: 'all', label: 'Alle' },
] as const;

export default function CleaningToolbar({
  canManage,
  cleaners,
}: {
  canManage: boolean;
  cleaners: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function nav(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    const q = next.toString();
    const href = (q ? `/cleaning?${q}` : '/cleaning') as Route;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  const range = sp.get('range') ?? 'open';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {RANGE_PRESETS.map((p) => (
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
        <label className="text-slate-500">Status</label>
        <select
          className={inputCls}
          value={sp.get('status') ?? ''}
          onChange={(e) => nav({ status: e.target.value })}
        >
          <option value="">Alle</option>
          <option value="open">Offen</option>
          <option value="in_progress">In Arbeit</option>
          <option value="done">Erledigt</option>
          <option value="quality_checked">QC erledigt</option>
        </select>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label className="text-slate-500">Typ</label>
        <select
          className={inputCls}
          value={sp.get('type') ?? ''}
          onChange={(e) => nav({ type: e.target.value })}
        >
          <option value="">Alle</option>
          <option value="checkout">Auszug</option>
          <option value="pre_checkin">Pre-Checkin</option>
          <option value="inspection">Inspektion</option>
          <option value="weekly_clean">Wöchentlich</option>
          <option value="intermediate">Wiederkehrend</option>
          <option value="special">Spezial</option>
          <option value="deep_clean">Endreinigung</option>
        </select>
      </div>

      {canManage && (
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-500">Reinigerin</label>
          <select
            className={inputCls}
            value={sp.get('assignee') ?? ''}
            onChange={(e) => nav({ assignee: e.target.value })}
          >
            <option value="">Alle</option>
            <option value="unassigned">Nicht zugewiesen</option>
            {cleaners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <span className="ml-auto text-xs text-slate-400">{pending ? 'Lade …' : ''}</span>
    </div>
  );
}
