'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, CheckCircle2, RotateCcw, X, Trash2, AlertTriangle } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  createApartmentDamage,
  deleteApartmentDamage,
  setDamageStatus,
} from '@/server/apartments/damages';
import { formatDate, formatTime } from '@/lib/dates';
import {
  apartmentDamageSeverityLabel,
  apartmentDamageSeverityTone,
  apartmentDamageStatusLabel,
  apartmentDamageStatusTone,
} from '@/lib/labels';
import type {
  ApartmentDamageSeverity,
  ApartmentDamageStatus,
} from '@/types/aliases';

export interface DamageRow {
  id: string;
  description: string;
  severity: ApartmentDamageSeverity;
  status: ApartmentDamageStatus;
  notes: string | null;
  reported_at: string;
  reported_by_name: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolution_notes: string | null;
}

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

const SEVERITY_OPTIONS: ApartmentDamageSeverity[] = [
  'minor',
  'normal',
  'major',
  'urgent',
];

export default function ApartmentDamagesSection({
  apartmentId,
  damages,
}: {
  apartmentId: string;
  damages: DamageRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const open = damages.filter(
    (d) => d.status === 'open' || d.status === 'in_progress',
  );
  const closed = damages.filter(
    (d) => d.status === 'resolved' || d.status === 'wont_fix',
  );
  const visible = showHistory ? damages : open;

  function withAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <div>
          <CardTitle>Schäden</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            {open.length} offen{closed.length > 0 ? ` · ${closed.length} erledigt` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {closed.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? 'Nur Offene' : 'Historie zeigen'}
            </Button>
          )}
          <Button size="sm" onClick={() => setShowWizard((v) => !v)}>
            <Plus className="h-4 w-4" />
            Neuer Schaden
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {showWizard && (
          <AddDamageForm
            apartmentId={apartmentId}
            onClose={() => setShowWizard(false)}
            onCreated={() => {
              setShowWizard(false);
              router.refresh();
            }}
          />
        )}

        {visible.length === 0 ? (
          <p className="text-sm text-slate-500">
            {showHistory ? 'Noch keine Schäden erfasst.' : 'Keine offenen Schäden.'}
          </p>
        ) : (
          <div className="space-y-2">
            {visible.map((d) => (
              <DamageRowItem
                key={d.id}
                damage={d}
                pending={pending}
                onSetStatus={(status, resNote) =>
                  withAction(() => setDamageStatus(d.id, status, resNote))
                }
                onDelete={() => {
                  if (!confirm('Schaden löschen?')) return;
                  withAction(() => deleteApartmentDamage(d.id));
                }}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function DamageRowItem({
  damage,
  pending,
  onSetStatus,
  onDelete,
}: {
  damage: DamageRow;
  pending: boolean;
  onSetStatus: (status: ApartmentDamageStatus, resolutionNotes?: string) => void;
  onDelete: () => void;
}) {
  const isOpen = damage.status === 'open' || damage.status === 'in_progress';
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={apartmentDamageSeverityTone[damage.severity]}>
              {apartmentDamageSeverityLabel[damage.severity]}
            </Badge>
            <Badge tone={apartmentDamageStatusTone[damage.status]}>
              {apartmentDamageStatusLabel[damage.status]}
            </Badge>
            <span className="text-xs text-slate-500">
              gemeldet {formatDate(damage.reported_at)}{' '}
              {formatTime(damage.reported_at)}
              {damage.reported_by_name && ` von ${damage.reported_by_name}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-900">{damage.description}</p>
          {damage.notes && (
            <p className="mt-1 text-xs whitespace-pre-wrap text-slate-600">
              {damage.notes}
            </p>
          )}
          {damage.resolved_at && (
            <p className="mt-1 text-xs text-emerald-700">
              {apartmentDamageStatusLabel[damage.status]} am{' '}
              {formatDate(damage.resolved_at)}
              {damage.resolved_by_name && ` durch ${damage.resolved_by_name}`}
              {damage.resolution_notes && ` · ${damage.resolution_notes}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {isOpen && (
            <>
              {damage.status === 'open' && (
                <button
                  type="button"
                  onClick={() => onSetStatus('in_progress')}
                  disabled={pending}
                  title="In Bearbeitung"
                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Bearbeite
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const note = prompt('Lösungs-Notiz (optional):') ?? undefined;
                  onSetStatus('resolved', note);
                }}
                disabled={pending}
                title="Erledigt"
                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Erledigt
              </button>
              <button
                type="button"
                onClick={() => onSetStatus('wont_fix')}
                disabled={pending}
                title="Wird nicht behoben"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {!isOpen && (
            <button
              type="button"
              onClick={() => onSetStatus('open')}
              disabled={pending}
              title="Wieder oeffnen"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
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
      </div>
    </div>
  );
}

function AddDamageForm({
  apartmentId,
  onClose,
  onCreated,
}: {
  apartmentId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(form: FormData) {
    setError(null);
    form.set('apartment_id', apartmentId);
    startTransition(async () => {
      const r = await createApartmentDamage(form);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else onCreated();
    });
  }

  return (
    <form
      action={handleSubmit}
      className="mb-4 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
    >
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      <div>
        <label className="block text-xs text-slate-500">Was ist beschädigt? *</label>
        <input
          name="description"
          required
          placeholder="z.B. Bidet undicht im Bad"
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-500">Schwere</label>
          <select name="severity" className={inputCls} defaultValue="normal">
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {apartmentDamageSeverityLabel[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Foto-URL (optional)</label>
          <input
            name="photo_url"
            placeholder="https://…"
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-500">Notiz / Kontext</label>
        <textarea
          name="notes"
          rows={2}
          className={`${inputCls} font-mono text-xs`}
          placeholder="z.B. Mieter hat heute gemeldet, Handwerker kommt am Mittwoch"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Speichere…' : 'Schaden erfassen'}
        </Button>
      </div>
    </form>
  );
}
