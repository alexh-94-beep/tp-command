'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

const ACTIONS = [
  { v: 'created', label: 'Erstellt' },
  { v: 'updated', label: 'Geändert' },
  { v: 'status_changed', label: 'Status geändert' },
  { v: 'assigned', label: 'Zugewiesen' },
  { v: 'cancelled', label: 'Storniert' },
  { v: 'deleted', label: 'Gelöscht' },
  { v: 'finalized', label: 'Finalisiert' },
  { v: 'invoiced', label: 'Rechnung erstellt' },
];

export default function AuditFilters({
  users,
  entities,
  defaults,
}: {
  users: Array<{ id: string; full_name: string; role: string }>;
  entities: Array<{ value: string; label: string }>;
  defaults: {
    actor: string;
    entity: string;
    action: string;
    from: string;
    to: string;
  };
}) {
  const router = useRouter();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sp = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string' && v.length > 0) sp.set(k, v);
    }
    router.push(`/settings/audit?${sp.toString()}` as never);
  }

  function reset() {
    router.push('/settings/audit' as never);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-5"
    >
      <div>
        <label className="block text-xs text-slate-500">User</label>
        <select name="actor" defaultValue={defaults.actor} className={inputCls}>
          <option value="">Alle</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name} ({u.role})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500">Objekt</label>
        <select name="entity" defaultValue={defaults.entity} className={inputCls}>
          <option value="">Alle</option>
          {entities.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500">Aktion</label>
        <select name="action" defaultValue={defaults.action} className={inputCls}>
          <option value="">Alle</option>
          {ACTIONS.map((a) => (
            <option key={a.v} value={a.v}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500">Von</label>
        <input
          type="date"
          name="from"
          defaultValue={defaults.from}
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-xs text-slate-500">Bis</label>
        <input type="date" name="to" defaultValue={defaults.to} className={inputCls} />
      </div>
      <div className="sm:col-span-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          Zurücksetzen
        </button>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Filtern
        </button>
      </div>
    </form>
  );
}
