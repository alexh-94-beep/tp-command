'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  CheckCircle2,
  RotateCcw,
  X,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  createStandaloneTask,
  deleteStandaloneTask,
  setStandaloneTaskStatus,
} from '@/server/tasks/standalone';
import { formatDate, todayIso } from '@/lib/dates';
import {
  standaloneTaskCategoryLabel,
  standaloneTaskPriorityLabel,
  standaloneTaskPriorityTone,
  standaloneTaskStatusLabel,
  standaloneTaskStatusTone,
} from '@/lib/labels';
import type {
  StandaloneTaskCategory,
  StandaloneTaskPriority,
  StandaloneTaskStatus,
} from '@/types/aliases';

export interface StandaloneRow {
  id: string;
  title: string;
  description: string | null;
  category: StandaloneTaskCategory;
  priority: StandaloneTaskPriority;
  status: StandaloneTaskStatus;
  apartment_number: string | null;
  assignee_name: string | null;
  due_date: string | null;
  created_at: string;
}

export interface UserOption {
  id: string;
  full_name: string;
  role?: string;
}

export interface ApartmentOption {
  id: string;
  number: string;
}

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

const CATEGORIES: StandaloneTaskCategory[] = ['repair', 'office', 'inspection', 'other'];
const PRIORITIES: StandaloneTaskPriority[] = ['low', 'normal', 'high', 'urgent'];

export default function StandaloneTasksSection({
  rows,
  users,
  apartments,
}: {
  rows: StandaloneRow[];
  users: UserOption[];
  apartments: ApartmentOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const today = todayIso();

  function withAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  const overdueCount = rows.filter(
    (r) =>
      r.due_date &&
      r.due_date < today &&
      (r.status === 'open' || r.status === 'in_progress'),
  ).length;

  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <div>
          <CardTitle>Freie Aufgaben</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Reparaturen, Office-Todos, Inspektionen — alles, was nicht an eine Buchung
            gebunden ist.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowWizard((v) => !v)}>
          <Plus className="h-4 w-4" />
          Neue Aufgabe
        </Button>
      </CardHeader>
      <CardBody>
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {showWizard && (
          <AddTaskForm
            users={users}
            apartments={apartments}
            onClose={() => setShowWizard(false)}
            onCreated={() => {
              setShowWizard(false);
              router.refresh();
            }}
          />
        )}

        {overdueCount > 0 && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            <strong>{overdueCount}</strong> überfällig
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            Noch keine freien Aufgaben. Klicke &bdquo;Neue Aufgabe&ldquo;.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Titel</th>
                  <th className="px-3 py-2">Kategorie</th>
                  <th className="px-3 py-2">Prio</th>
                  <th className="px-3 py-2">Wohnung</th>
                  <th className="px-3 py-2">Zugewiesen</th>
                  <th className="px-3 py-2">Fällig</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const isOverdueCalc =
                    r.due_date &&
                    r.due_date < today &&
                    (r.status === 'open' || r.status === 'in_progress');
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <a
                          href={`/tasks/${r.id}`}
                          className="font-medium hover:underline"
                        >
                          {r.title}
                        </a>
                        {r.description && (
                          <div className="mt-0.5 max-w-md truncate text-xs text-slate-500">
                            {r.description}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                        {standaloneTaskCategoryLabel[r.category]}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge tone={standaloneTaskPriorityTone[r.priority]}>
                          {standaloneTaskPriorityLabel[r.priority]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {r.apartment_number ?? '–'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {r.assignee_name ?? '–'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.due_date ? (
                          <span
                            className={isOverdueCalc ? 'font-medium text-red-700' : ''}
                          >
                            {formatDate(r.due_date)}
                          </span>
                        ) : (
                          '–'
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge tone={standaloneTaskStatusTone[r.status]}>
                          {standaloneTaskStatusLabel[r.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <RowActions
                          row={r}
                          pending={pending}
                          onMarkDone={() =>
                            withAction(() => setStandaloneTaskStatus(r.id, 'done'))
                          }
                          onReopen={() =>
                            withAction(() => setStandaloneTaskStatus(r.id, 'open'))
                          }
                          onStart={() =>
                            withAction(() =>
                              setStandaloneTaskStatus(r.id, 'in_progress'),
                            )
                          }
                          onCancel={() =>
                            withAction(() => setStandaloneTaskStatus(r.id, 'cancelled'))
                          }
                          onDelete={() => {
                            if (!confirm('Aufgabe loeschen?')) return;
                            withAction(() => deleteStandaloneTask(r.id));
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RowActions({
  row,
  pending,
  onMarkDone,
  onReopen,
  onStart,
  onCancel,
  onDelete,
}: {
  row: StandaloneRow;
  pending: boolean;
  onMarkDone: () => void;
  onReopen: () => void;
  onStart: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      {row.status === 'open' && (
        <button
          type="button"
          onClick={onStart}
          disabled={pending}
          title="In Arbeit nehmen"
          className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          Start
        </button>
      )}
      {(row.status === 'open' || row.status === 'in_progress') && (
        <button
          type="button"
          onClick={onMarkDone}
          disabled={pending}
          title="Erledigt"
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
      )}
      {row.status === 'done' && (
        <button
          type="button"
          onClick={onReopen}
          disabled={pending}
          title="Wieder oeffnen"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      {row.status !== 'cancelled' && row.status !== 'done' && (
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          title="Stornieren"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        title="Loeschen"
        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function AddTaskForm({
  users,
  apartments,
  onClose,
  onCreated,
}: {
  users: UserOption[];
  apartments: ApartmentOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await createStandaloneTask(form);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else onCreated();
    });
  }

  return (
    <form
      action={handleSubmit}
      className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3"
    >
      {error && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="title"
          required
          placeholder="Titel (z.B. Schloss in C.0202 ersetzen)"
          className={`${inputCls} sm:col-span-2`}
        />
        <select name="category" className={inputCls} defaultValue="repair">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {standaloneTaskCategoryLabel[c]}
            </option>
          ))}
        </select>
        <select name="priority" className={inputCls} defaultValue="normal">
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {standaloneTaskPriorityLabel[p]}
            </option>
          ))}
        </select>
        <select name="apartment_id" className={inputCls} defaultValue="">
          <option value="">— keine Wohnung —</option>
          {apartments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.number}
            </option>
          ))}
        </select>
        <select name="assignee_id" className={inputCls} defaultValue="">
          <option value="">— offen / für alle —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
              {u.role ? ` (${u.role})` : ''}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="due_date"
          className={inputCls}
          placeholder="Faelligkeit (optional)"
        />
        <input
          name="description"
          placeholder="Kurzbeschreibung (optional)"
          className={inputCls}
        />
        <textarea
          name="notes"
          rows={3}
          placeholder="Notizen / Kontakt aus dem Anruf"
          className={`${inputCls} sm:col-span-2 font-mono text-xs`}
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Erzeuge…' : 'Aufgabe anlegen'}
        </Button>
      </div>
    </form>
  );
}
