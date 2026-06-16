'use client';

/**
 * Quick-Add fuer Standalone-Aufgaben auf dem Mireme-Dashboard.
 *
 * Sitzungs-Wunsch (Phase 15): Mireme nimmt Telefonate entgegen
 * (Schadensmeldungen, Liftreservationen, Office-Anfragen). Sie soll
 * daraus direkt eine Aufgabe erfassen koennen — ohne Umweg ueber die
 * /tasks-Seite, die fuer admin/office gesperrt ist.
 *
 * Im Form: Titel + Kategorie (Schadensmeldung / Liftreservation /
 * Reparatur / Office-Todo / Inspektion / Sonstige) + Priorität +
 * Wohnung (optional) + Zugewiesen an (Default: Office picks) +
 * Beschreibung + Faellig.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createStandaloneTask } from '@/server/tasks/standalone';
import { standaloneTaskCategoryLabel } from '@/lib/labels';
import type { StandaloneTaskCategory } from '@/types/aliases';

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

// Telefon-relevante Kategorien stehen oben, dann der Rest
const CATEGORIES: StandaloneTaskCategory[] = [
  'damage_report',
  'lift_reservation',
  'repair',
  'office',
  'inspection',
  'other',
];

const PRIORITIES = [
  { v: 'low', label: 'Niedrig' },
  { v: 'normal', label: 'Normal' },
  { v: 'high', label: 'Hoch' },
  { v: 'urgent', label: 'Dringend' },
] as const;

export interface NewStandaloneTaskButtonProps {
  apartments: Array<{ id: string; number: string }>;
  users: Array<{ id: string; full_name: string; role: string }>;
  /** Optional: Default-Beschriftung, z.B. "Telefon-Aufgabe erfassen" */
  label?: string;
}

export default function NewStandaloneTaskButton({
  apartments,
  users,
  label = 'Aufgabe erfassen',
}: NewStandaloneTaskButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await createStandaloneTask(form);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {label}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            action={handleSubmit}
            className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <div className="flex items-center gap-2 text-base font-semibold">
                  <Phone className="h-4 w-4 text-slate-500" />
                  Neue Aufgabe
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  z.B. Telefon-Anruf, Schadensmeldung, Liftreservation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-auto px-6 py-5">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-500">Titel *</label>
                <input
                  name="title"
                  required
                  placeholder="z.B. Lift Tower D am 22.06. 10:00-12:00 (Frau Müller)"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500">Kategorie</label>
                  <select
                    name="category"
                    className={inputCls}
                    defaultValue="damage_report"
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
                  <select name="priority" className={inputCls} defaultValue="normal">
                    {PRIORITIES.map((p) => (
                      <option key={p.v} value={p.v}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500">Wohnung (optional)</label>
                  <select name="apartment_id" className={inputCls} defaultValue="">
                    <option value="">— keine —</option>
                    {apartments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.number}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500">
                    Zugewiesen an (optional)
                  </label>
                  <select name="assignee_id" className={inputCls} defaultValue="">
                    <option value="">— offen (Office verteilt) —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500">Fällig (optional)</label>
                <input type="date" name="due_date" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs text-slate-500">Beschreibung</label>
                <textarea
                  name="description"
                  rows={3}
                  className={inputCls}
                  placeholder="Kontakt, Symptom, was wurde besprochen..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Speichere…' : 'Aufgabe erfassen'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
