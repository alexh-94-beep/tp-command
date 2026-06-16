'use client';

import { useState } from 'react';

/**
 * Kompakte Anzeige eines audit_log.diff-Eintrags.
 *
 * Erwartet Strukturen wie:
 *   { status: { before: 'open', after: 'done' }, ... }
 *   { _note: 'Mieter hat abgesagt' }
 *   { invoice_number: '2026-001' }
 *
 * Klick-zum-Aufklappen wenn mehr als 2 Felder.
 */
export default function AuditDiff({
  diff,
}: {
  diff: Record<string, unknown> | null;
}) {
  const [open, setOpen] = useState(false);
  if (!diff) return <span className="text-xs text-slate-400">—</span>;

  const entries = Object.entries(diff);
  if (entries.length === 0) return <span className="text-xs text-slate-400">—</span>;

  const shown = open ? entries : entries.slice(0, 2);
  const hasMore = entries.length > 2;

  return (
    <div className="space-y-1 text-xs">
      {shown.map(([key, value]) => (
        <div key={key} className="flex flex-wrap gap-1">
          {key === '_note' ? (
            <span className="italic text-slate-700">{String(value)}</span>
          ) : (
            <>
              <span className="font-medium text-slate-600">{key}:</span>
              <DiffValue value={value} />
            </>
          )}
        </div>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-slate-500 hover:text-slate-700 hover:underline"
        >
          {open ? 'weniger' : `+${entries.length - 2} weitere`}
        </button>
      )}
    </div>
  );
}

function DiffValue({ value }: { value: unknown }) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('before' in value || 'after' in value)
  ) {
    const v = value as { before?: unknown; after?: unknown };
    return (
      <span>
        <span className="text-red-700 line-through">{fmt(v.before)}</span>
        <span className="mx-1 text-slate-400">→</span>
        <span className="text-emerald-700">{fmt(v.after)}</span>
      </span>
    );
  }
  return <span className="text-slate-700">{fmt(value)}</span>;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
