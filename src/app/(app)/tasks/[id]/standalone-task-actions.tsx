'use client';

/**
 * Bearbeiten + Status + Storno fuer eine Standalone-Aufgabe.
 *
 * Phase 15: Mireme erfasst Aufgaben aus Telefon-Annahme und muss sie
 * danach bearbeiten koennen. Sie hat Edit-Rechte fuer:
 *   - Aufgaben, die sie selbst erfasst hat (created_by = me)
 *   - Aufgaben, die ihr zugewiesen sind (assignee_id = me)
 * Office/Admin haben volle Rechte (inkl. loeschen).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pencil,
  X,
  CheckCircle2,
  RotateCcw,
  Play,
  Ban,
  Trash2,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  updateStandaloneTask,
  setStandaloneTaskStatus,
  deleteStandaloneTask,
} from '@/server/tasks/standalone';
import { standaloneTaskCategoryLabel } from '@/lib/labels';
import type {
  StandaloneTaskCategory,
  StandaloneTaskPriority,
  StandaloneTaskStatus,
} from '@/types/aliases';

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

const CATEGORIES: StandaloneTaskCategory[] = [
  'damage_report',
  'lift_reservation',
  'repair',
  'office',
  'inspection',
  'other',
];
const PRIORITIES: { v: StandaloneTaskPriority; label: string }[] = [
  { v: 'low', label: 'Niedrig' },
  { v: 'normal', label: 'Normal' },
  { v: 'high', label: 'Hoch' },
  { v: 'urgent', label: 'Dringend' },
];

type AptMode = 'internal' | 'external' | 'none';

interface TaskShape {
  id: string;
  title: string;
  description: string | null;
  category: StandaloneTaskCategory;
  priority: StandaloneTaskPriority;
  status: StandaloneTaskStatus;
  apartment_id: string | null;
  apartment_label: string | null;
  assignee_id: string | null;
  due_date: string | null;
  due_time: string | null;
  notes: string | null;
}

export default function StandaloneTaskActions({
  task,
  apartments,
  users,
  canDelete,
}: {
  task: TaskShape;
  apartments: Array<{ id: string; number: string }>;
  users: Array<{ id: string; full_name: string; role: string }>;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aptMode, setAptMode] = useState<AptMode>(
    task.apartment_id ? 'internal' : task.apartment_label ? 'external' : 'none',
  );

  const isClosed = task.status === 'done' || task.status === 'cancelled';

  function handleEdit(form: FormData) {
    setError(null);
    form.set('task_id', task.id);
    // Wohnungs-Toggle: nur ein Feld senden
    if (aptMode === 'internal') {
      form.delete('apartment_label');
    } else if (aptMode === 'external') {
      form.delete('apartment_id');
    } else {
      form.delete('apartment_id');
      form.delete('apartment_label');
    }
    startTransition(async () => {
      const r = await updateStandaloneTask(form);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function changeStatus(next: StandaloneTaskStatus) {
    setError(null);
    startTransition(async () => {
      const r = await setStandaloneTaskStatus(task.id, next);
      if (!r.ok) setError(r.error ?? 'Fehler');
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm('Aufgabe wirklich löschen? Das kann nicht rückgängig gemacht werden.')) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await deleteStandaloneTask(task.id);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      router.push('/dashboard');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktionen</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!editing && (
          <div className="flex flex-wrap gap-2">
            {task.status === 'open' && (
              <Button onClick={() => changeStatus('in_progress')} disabled={pending}>
                <Play className="h-4 w-4" />
                In Arbeit nehmen
              </Button>
            )}
            {task.status === 'in_progress' && (
              <Button onClick={() => changeStatus('done')} disabled={pending}>
                <CheckCircle2 className="h-4 w-4" />
                Erledigt
              </Button>
            )}
            {task.status === 'open' && (
              <Button onClick={() => changeStatus('done')} disabled={pending} variant="secondary">
                <CheckCircle2 className="h-4 w-4" />
                Direkt erledigt
              </Button>
            )}
            {isClosed && (
              <Button onClick={() => changeStatus('open')} disabled={pending} variant="secondary">
                <RotateCcw className="h-4 w-4" />
                Wieder öffnen
              </Button>
            )}
            {!isClosed && (
              <Button onClick={() => setEditing(true)} disabled={pending} variant="secondary">
                <Pencil className="h-4 w-4" />
                Bearbeiten
              </Button>
            )}
            {!isClosed && task.status !== 'cancelled' && (
              <Button
                onClick={() => changeStatus('cancelled')}
                disabled={pending}
                variant="secondary"
              >
                <Ban className="h-4 w-4" />
                Stornieren
              </Button>
            )}
            {canDelete && (
              <Button onClick={handleDelete} disabled={pending} variant="secondary">
                <Trash2 className="h-4 w-4" />
                Löschen
              </Button>
            )}
          </div>
        )}

        {editing && (
          <form action={handleEdit} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500">Titel *</label>
              <input
                name="title"
                required
                defaultValue={task.title}
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-500">Kategorie</label>
                <select
                  name="category"
                  defaultValue={task.category}
                  className={inputCls}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {standaloneTaskCategoryLabel[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500">Priorität</label>
                <select
                  name="priority"
                  defaultValue={task.priority}
                  className={inputCls}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.v} value={p.v}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500">Wohnung</label>
              <div className="mb-2 grid grid-cols-3 gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setAptMode('none')}
                  className={`rounded px-2 py-1.5 font-medium ${
                    aptMode === 'none'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Keine
                </button>
                <button
                  type="button"
                  onClick={() => setAptMode('internal')}
                  className={`rounded px-2 py-1.5 font-medium ${
                    aptMode === 'internal'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Eigene Wohnung
                </button>
                <button
                  type="button"
                  onClick={() => setAptMode('external')}
                  className={`rounded px-2 py-1.5 font-medium ${
                    aptMode === 'external'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Andere (Freitext)
                </button>
              </div>
              {aptMode === 'internal' && (
                <select
                  name="apartment_id"
                  defaultValue={task.apartment_id ?? ''}
                  className={inputCls}
                >
                  <option value="">— Wohnung wählen —</option>
                  {apartments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.number}
                    </option>
                  ))}
                </select>
              )}
              {aptMode === 'external' && (
                <input
                  name="apartment_label"
                  defaultValue={task.apartment_label ?? ''}
                  placeholder="z.B. E.2201"
                  className={inputCls}
                />
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-500">Zugewiesen an</label>
              <select
                name="assignee_id"
                defaultValue={task.assignee_id ?? ''}
                className={inputCls}
              >
                <option value="">— offen (Office verteilt) —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500">Fällig am</label>
                <input
                  type="date"
                  name="due_date"
                  defaultValue={task.due_date ?? ''}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500">Uhrzeit</label>
                <input
                  type="time"
                  name="due_time"
                  defaultValue={task.due_time?.slice(0, 5) ?? ''}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500">Beschreibung</label>
              <textarea
                name="description"
                rows={3}
                defaultValue={task.description ?? ''}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500">Notiz</label>
              <textarea
                name="notes"
                rows={2}
                defaultValue={task.notes ?? ''}
                className={inputCls}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                <X className="h-4 w-4" />
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Speichere…' : 'Änderungen speichern'}
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
