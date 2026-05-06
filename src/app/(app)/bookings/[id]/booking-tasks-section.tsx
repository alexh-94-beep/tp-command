'use client';

import { useState, useTransition } from 'react';
import {
  Check,
  CircleDot,
  ListChecks,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  addManualTask,
  deleteManualTask,
  regenerateBookingTasks,
  setTaskStatus,
  updateTaskNotes,
} from '@/server/workflow/actions';

export interface BookingTaskRow {
  id: string;
  kind: 'move_in' | 'move_out';
  position: number;
  code: string | null;
  title: string;
  description: string | null;
  category: string | null;
  due_date: string | null;
  status: 'open' | 'in_progress' | 'done' | 'skipped' | 'na';
  is_optional: boolean;
  is_conditional: boolean;
  notes: string | null;
  template_task_id: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
}

interface Props {
  bookingId: string;
  tasks: BookingTaskRow[];
}

const statusToneMap: Record<BookingTaskRow['status'], 'neutral' | 'success' | 'warning' | 'info' | 'danger'> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  skipped: 'neutral',
  na: 'neutral',
};

const statusLabelMap: Record<BookingTaskRow['status'], string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  done: 'Erledigt',
  skipped: 'Übersprungen',
  na: 'N/A',
};

function formatDate(iso: string | null): string {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function dueBadge(due: string | null, status: BookingTaskRow['status']) {
  if (!due) return null;
  if (status === 'done' || status === 'skipped' || status === 'na') {
    return <span className="text-xs text-slate-400">{formatDate(due)}</span>;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (due < today) {
    return <Badge tone="danger">Überfällig · {formatDate(due)}</Badge>;
  }
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  if (due <= in7.toISOString().slice(0, 10)) {
    return <Badge tone="warning">{formatDate(due)}</Badge>;
  }
  return <span className="text-xs text-slate-500">{formatDate(due)}</span>;
}

export default function BookingTasksSection({ bookingId, tasks }: Props) {
  const moveIn = tasks.filter((t) => t.kind === 'move_in').sort((a, b) => a.position - b.position);
  const moveOut = tasks.filter((t) => t.kind === 'move_out').sort((a, b) => a.position - b.position);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Aufgaben
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-6">
        <TaskGroup
          bookingId={bookingId}
          kind="move_in"
          title="Einzug"
          tasks={moveIn}
        />
        <TaskGroup
          bookingId={bookingId}
          kind="move_out"
          title="Auszug"
          tasks={moveOut}
        />

        {tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Noch keine Aufgaben für diese Buchung.
          </div>
        )}

        <RegenerateButton bookingId={bookingId} hasAny={tasks.length > 0} />
      </CardBody>
    </Card>
  );
}

function TaskGroup({
  bookingId,
  kind,
  title,
  tasks,
}: {
  bookingId: string;
  kind: 'move_in' | 'move_out';
  title: string;
  tasks: BookingTaskRow[];
}) {
  const open = tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
  const total = tasks.filter((t) => t.status !== 'na').length;

  // Gruppierung nach Kategorie
  const grouped = new Map<string, BookingTaskRow[]>();
  for (const t of tasks) {
    const cat = t.category ?? 'Sonstiges';
    const list = grouped.get(cat) ?? [];
    list.push(t);
    grouped.set(cat, list);
  }

  return (
    <section>
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {title}
          <span className="ml-2 text-xs font-normal text-slate-500">
            {open} offen / {total} total
          </span>
        </h3>
        <AddTaskInline bookingId={bookingId} kind={kind} />
      </div>

      {tasks.length === 0 ? (
        <div className="mt-3 text-sm text-slate-500">Keine Aufgaben.</div>
      ) : (
        <div className="mt-3 space-y-4">
          {Array.from(grouped.entries()).map(([cat, list]) => (
            <div key={cat}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {cat}
              </div>
              <ul className="mt-1 divide-y divide-slate-100">
                {list.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task }: { task: BookingTaskRow }) {
  const [pending, startTransition] = useTransition();
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [menuOpen, setMenuOpen] = useState(false);

  const isDone = task.status === 'done';
  const isNA = task.status === 'na' || task.status === 'skipped';

  function toggle() {
    const next = isDone ? 'open' : 'done';
    startTransition(async () => {
      await setTaskStatus(task.id, next);
    });
  }

  function setStatus(s: BookingTaskRow['status']) {
    setMenuOpen(false);
    startTransition(async () => {
      await setTaskStatus(task.id, s);
    });
  }

  function saveNotes() {
    startTransition(async () => {
      await updateTaskNotes(task.id, notes);
      setShowNotes(false);
    });
  }

  function deleteSelf() {
    if (!confirm('Aufgabe löschen?')) return;
    setMenuOpen(false);
    startTransition(async () => {
      await deleteManualTask(task.id);
    });
  }

  return (
    <li className={`group py-2 ${isNA ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={pending || isNA}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
            isDone
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-slate-300 bg-white hover:border-slate-500'
          } disabled:cursor-not-allowed disabled:opacity-50`}
          aria-label={isDone ? 'Erledigt aufheben' : 'Als erledigt markieren'}
        >
          {isDone && <Check className="h-3.5 w-3.5" />}
          {task.status === 'in_progress' && <CircleDot className="h-3.5 w-3.5 text-blue-500" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className={`text-sm ${
                isDone ? 'text-slate-400 line-through' : 'text-slate-900'
              }`}
            >
              {task.title}
            </span>
            {task.is_optional && (
              <span className="text-[10px] uppercase tracking-wide text-slate-400">optional</span>
            )}
            {task.is_conditional && (
              <span className="text-[10px] uppercase tracking-wide text-amber-600">bedingt</span>
            )}
            {task.status !== 'open' && (
              <Badge tone={statusToneMap[task.status]}>{statusLabelMap[task.status]}</Badge>
            )}
          </div>
          {task.description && !isDone && (
            <div className="mt-0.5 text-xs text-slate-500">{task.description}</div>
          )}
          {(task.notes || showNotes) && (
            <div className="mt-1">
              {showNotes ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    placeholder="Notiz …"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setNotes(task.notes ?? '');
                        setShowNotes(false);
                      }}
                      className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={saveNotes}
                      disabled={pending}
                      className="rounded bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNotes(true)}
                  className="rounded bg-slate-50 px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-100"
                >
                  {task.notes}
                </button>
              )}
            </div>
          )}
          {task.completed_at && task.completed_by_name && isDone && (
            <div className="mt-0.5 text-[11px] text-slate-400">
              erledigt am {new Date(task.completed_at).toLocaleString('de-CH')} von {task.completed_by_name}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {dueBadge(task.due_date, task.status)}

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Mehr"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                {!showNotes && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setShowNotes(true);
                    }}
                    className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
                  >
                    Notiz {task.notes ? 'bearbeiten' : 'hinzufügen'}
                  </button>
                )}
                <button
                  onClick={() => setStatus('in_progress')}
                  className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
                >
                  In Arbeit
                </button>
                <button
                  onClick={() => setStatus('open')}
                  className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
                >
                  <RotateCcw className="mr-1 inline h-3.5 w-3.5" /> Wieder öffnen
                </button>
                <button
                  onClick={() => setStatus('skipped')}
                  className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
                >
                  <X className="mr-1 inline h-3.5 w-3.5" /> Überspringen
                </button>
                <button
                  onClick={() => setStatus('na')}
                  className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
                >
                  Als N/A markieren
                </button>
                {!task.template_task_id && (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      onClick={deleteSelf}
                      className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Löschen
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function AddTaskInline({
  bookingId,
  kind,
}: {
  bookingId: string;
  kind: 'move_in' | 'move_out';
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return;
    const fd = new FormData();
    fd.set('booking_id', bookingId);
    fd.set('kind', kind);
    fd.set('title', title);
    if (dueDate) fd.set('due_date', dueDate);
    startTransition(async () => {
      const r = await addManualTask(fd);
      if (r.ok) {
        setTitle('');
        setDueDate('');
        setOpen(false);
      } else {
        alert(r.error ?? 'Fehler');
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
      >
        <Plus className="h-3.5 w-3.5" />
        Aufgabe
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Neue Aufgabe …"
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') setOpen(false);
        }}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
      />
      <button
        onClick={submit}
        disabled={pending || !title.trim()}
        className="rounded bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
      >
        OK
      </button>
      <button
        onClick={() => setOpen(false)}
        className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
      >
        ✕
      </button>
    </div>
  );
}

function RegenerateButton({
  bookingId,
  hasAny,
}: {
  bookingId: string;
  hasAny: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
      <span>
        {hasAny
          ? 'Fehlende Schritte aus Vorlage ergänzen?'
          : 'Workflow-Vorlage ist noch nicht instanziiert.'}
      </span>
      <Button
        variant="secondary"
        type="button"
        onClick={() =>
          startTransition(async () => {
            const r = await regenerateBookingTasks(bookingId);
            if (!r.ok) alert(r.error ?? 'Fehler');
          })
        }
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {hasAny ? 'Aktualisieren' : 'Aufgaben erzeugen'}
      </Button>
    </div>
  );
}
