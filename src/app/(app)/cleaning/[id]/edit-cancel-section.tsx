'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Ban, RotateCcw, X } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  cancelCleaningTask,
  uncancelCleaningTask,
  updateCleaningTask,
} from '@/server/cleaning/actions';
import type { CleaningStatus } from '@/types/aliases';

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

const TYPE_OPTIONS = [
  { v: 'checkout', label: 'Auszugs-Reinigung' },
  { v: 'pre_checkin', label: 'Pre-Checkin' },
  { v: 'intermediate', label: 'Zwischenreinigung' },
  { v: 'special', label: 'Spezial' },
  { v: 'deep_clean', label: 'Abnahmereinigung' },
  { v: 'inspection', label: 'Inspektion' },
  { v: 'weekly_clean', label: 'Wöchentlich' },
  { v: 'weekly_clean_linen', label: 'Wöchentlich + Wäsche' },
  { v: 'biweekly_clean', label: 'Zweiwöchentlich' },
  { v: 'biweekly_clean_linen', label: 'Zweiwöchentlich + Wäsche' },
  { v: 'monthly_clean', label: 'Monatlich' },
  { v: 'monthly_clean_linen', label: 'Monatlich + Wäsche' },
] as const;

const PRIORITY_OPTIONS = [
  { v: 'low', label: 'Niedrig' },
  { v: 'normal', label: 'Normal' },
  { v: 'high', label: 'Hoch' },
  { v: 'urgent', label: 'Dringend' },
] as const;

interface Props {
  taskId: string;
  status: CleaningStatus;
  canManage: boolean; // admin/office: kann Storno auch zurücknehmen
  defaults: {
    scheduled_date: string;
    scheduled_time: string | null;
    type: string;
    priority: string;
    estimated_duration_minutes: number | null;
    notes: string | null;
    linen_change: boolean | null;
    time_flexible: boolean | null;
    time_constraint_note: string | null;
  };
  cancellation?: {
    reason: string | null;
    at: string | null;
    by_name: string | null;
  };
}

export default function EditCancelSection({
  taskId,
  status,
  canManage,
  defaults,
  cancellation,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isCancelled = status === 'cancelled';
  const isClosed = status === 'done' || status === 'quality_checked';

  function handleEdit(form: FormData) {
    setError(null);
    form.set('task_id', taskId);
    startTransition(async () => {
      const r = await updateCleaningTask(form);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function handleCancel() {
    setError(null);
    if (reason.trim().length < 3) {
      setError('Bitte einen kurzen Grund eingeben.');
      return;
    }
    startTransition(async () => {
      const r = await cancelCleaningTask(taskId, reason.trim());
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      setCancelOpen(false);
      setReason('');
      router.refresh();
    });
  }

  function handleUncancel() {
    startTransition(async () => {
      const r = await uncancelCleaningTask(taskId);
      if (!r.ok) setError(r.error ?? 'Fehler');
      router.refresh();
    });
  }

  if (isCancelled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Storniert</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
            <div className="font-medium text-red-900">Auftrag storniert</div>
            {cancellation?.reason && (
              <div className="mt-1 whitespace-pre-wrap text-red-800">
                Grund: {cancellation.reason}
              </div>
            )}
            <div className="mt-1 text-xs text-red-700">
              {cancellation?.at &&
                new Date(cancellation.at).toLocaleString('de-CH')}
              {cancellation?.by_name && ` · ${cancellation.by_name}`}
            </div>
          </div>
          {canManage && (
            <Button
              variant="secondary"
              onClick={handleUncancel}
              disabled={pending}
            >
              <RotateCcw className="h-4 w-4" />
              Storno zurücknehmen (Office)
            </Button>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auftrag bearbeiten</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!editing && !cancelOpen && (
          <div className="flex flex-wrap gap-2">
            {!isClosed && (
              <Button onClick={() => setEditing(true)} disabled={pending}>
                <Pencil className="h-4 w-4" />
                Bearbeiten
              </Button>
            )}
            {!isClosed && (
              <Button
                variant="secondary"
                onClick={() => setCancelOpen(true)}
                disabled={pending}
              >
                <Ban className="h-4 w-4" />
                Stornieren
              </Button>
            )}
            {isClosed && (
              <p className="text-sm text-slate-500">
                Erledigte Aufträge können nicht mehr bearbeitet oder storniert
                werden.
              </p>
            )}
          </div>
        )}

        {editing && (
          <form action={handleEdit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-500">Datum</label>
                <input
                  type="date"
                  name="scheduled_date"
                  defaultValue={defaults.scheduled_date}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500">
                  Uhrzeit (optional)
                </label>
                <input
                  type="time"
                  name="scheduled_time"
                  defaultValue={defaults.scheduled_time ?? ''}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500">Typ</label>
                <select
                  name="type"
                  defaultValue={defaults.type}
                  className={inputCls}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500">Priorität</label>
                <select
                  name="priority"
                  defaultValue={defaults.priority}
                  className={inputCls}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.v} value={p.v}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500">
                  Effektive Reinigungszeit (Min)
                </label>
                <input
                  type="number"
                  name="estimated_duration_minutes"
                  defaultValue={defaults.estimated_duration_minutes ?? ''}
                  placeholder="z.B. 90"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="linen_change"
                  value="1"
                  defaultChecked={!!defaults.linen_change}
                />
                Bettwäsche wechseln
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="time_flexible"
                  value="1"
                  defaultChecked={defaults.time_flexible !== false}
                />
                Zeitlich flexibel
              </label>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500">
                  Zeitliche Vorgabe / Hinweis
                </label>
                <input
                  name="time_constraint_note"
                  defaultValue={defaults.time_constraint_note ?? ''}
                  placeholder="z.B. Eigentümer wünscht 10:00 zwingend"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500">
                Notiz / Auftrag (komplett ersetzen)
              </label>
              <textarea
                name="notes"
                rows={4}
                defaultValue={defaults.notes ?? ''}
                className={`${inputCls} font-mono text-xs`}
                placeholder="Aufgaben-Beschreibung, Spezialwünsche, Kontaktinfos..."
              />
              <p className="mt-1 text-xs text-slate-500">
                Tipp: Für schnellen Eintrag mit Zeitstempel oben &bdquo;Notiz
                hinzufügen&ldquo; benutzen.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
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

        {cancelOpen && (
          <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="text-sm font-medium text-amber-900">
              Auftrag stornieren
            </div>
            <p className="text-xs text-amber-800">
              Der Auftrag bleibt im System erhalten und ist im Filter &bdquo;Alle&ldquo;
              sichtbar. Bitte einen kurzen Grund eintragen.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="z.B. Mieter hat abgesagt / Doppel-Erfassung / extern erledigt"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCancelOpen(false);
                  setReason('');
                  setError(null);
                }}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                onClick={handleCancel}
                disabled={pending || reason.trim().length < 3}
              >
                {pending ? 'Storniere…' : 'Auftrag stornieren'}
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
