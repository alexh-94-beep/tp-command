'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createCleaningTask } from '@/server/cleaning/actions';
import { createOwnerWithApartment } from '@/server/cleaning/externals';
import { todayIso } from '@/lib/dates';

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

const TYPE_OPTIONS = [
  { v: 'checkout', label: 'Auszugs-Reinigung' },
  { v: 'pre_checkin', label: 'Pre-Checkin' },
  { v: 'intermediate', label: 'Zwischenreinigung' },
  { v: 'special', label: 'Spezial' },
  { v: 'deep_clean', label: 'Endreinigung' },
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

export interface ExternalOwnerOption {
  id: string;
  name: string;
  apartments: { id: string; label: string }[];
}

export default function NewCleaningButton({
  apartments,
  staff,
  externalOwners,
}: {
  apartments: Array<{ id: string; number: string }>;
  staff: Array<{ id: string; full_name: string }>;
  externalOwners: ExternalOwnerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Wohnungstyp-Picker State
  const [mode, setMode] = useState<'internal' | 'external'>('internal');
  const [ownerId, setOwnerId] = useState<string>('');
  const [externalAptId, setExternalAptId] = useState<string>('');
  const [showOwnerWizard, setShowOwnerWizard] = useState(false);

  // Eigentümer-Wizard State
  const [owners, setOwners] = useState<ExternalOwnerOption[]>(externalOwners);

  const selectedOwner = owners.find((o) => o.id === ownerId);

  function handleSubmit(form: FormData) {
    setError(null);
    if (mode === 'external') {
      if (!externalAptId) {
        setError('Bitte erst eine Wohnung des Eigentümers wählen.');
        return;
      }
      form.delete('apartment_id');
      form.set('external_apartment_id', externalAptId);
    } else {
      form.delete('external_apartment_id');
    }
    startTransition(async () => {
      const r = await createCleaningTask(form);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function handleOwnerWizard(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await createOwnerWithApartment(form);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      const newOwner: ExternalOwnerOption = {
        id: r.ownerId!,
        name: String(form.get('owner_name') ?? ''),
        apartments: [
          {
            id: r.externalApartmentId!,
            label: String(form.get('apartment_label') ?? ''),
          },
        ],
      };
      setOwners([newOwner, ...owners]);
      setOwnerId(newOwner.id);
      setExternalAptId(newOwner.apartments[0].id);
      setShowOwnerWizard(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Neue Reinigung
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
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-semibold">Neuer Reinigungs-Auftrag</h2>
              <p className="mt-1 text-xs text-slate-500">
                Manuell, z.B. weil der Mieter über das Telefon eine Sonder-Reinigung
                angefragt hat.
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-auto px-6 py-5">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              {/* Wohnungs-Modus */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('internal')}
                  className={`h-10 rounded-lg border text-sm font-medium ${
                    mode === 'internal'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Eigene Wohnung
                </button>
                <button
                  type="button"
                  onClick={() => setMode('external')}
                  className={`h-10 rounded-lg border text-sm font-medium ${
                    mode === 'external'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Externe Wohnung (Eigentümer)
                </button>
              </div>

              {mode === 'internal' && (
                <div>
                  <label className="block text-xs text-slate-500">Wohnung *</label>
                  <select name="apartment_id" required={mode === 'internal'} className={inputCls}>
                    <option value="">— Wohnung wählen —</option>
                    {apartments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.number}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {mode === 'external' && (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                  {!showOwnerWizard ? (
                    <>
                      <div>
                        <label className="block text-xs text-slate-500">Eigentümer *</label>
                        <div className="flex gap-2">
                          <select
                            className={inputCls}
                            value={ownerId}
                            onChange={(e) => {
                              setOwnerId(e.target.value);
                              setExternalAptId('');
                            }}
                          >
                            <option value="">— Eigentümer wählen —</option>
                            {owners.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowOwnerWizard(true)}
                            className="inline-flex h-10 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
                            title="Neuen Eigentümer + Wohnung anlegen"
                          >
                            <UserPlus className="h-4 w-4" />
                            Neu
                          </button>
                        </div>
                      </div>
                      {selectedOwner && (
                        <div>
                          <label className="block text-xs text-slate-500">Wohnung *</label>
                          <select
                            className={inputCls}
                            value={externalAptId}
                            onChange={(e) => setExternalAptId(e.target.value)}
                          >
                            <option value="">— Wohnung des Eigentümers —</option>
                            {selectedOwner.apartments.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                          {selectedOwner.apartments.length === 0 && (
                            <p className="mt-1 text-xs text-amber-800">
                              Eigentümer hat noch keine Wohnung erfasst. Anlegen kann
                              Office in den Einstellungen.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <OwnerWizard
                      pending={pending}
                      onCancel={() => setShowOwnerWizard(false)}
                      onSubmit={handleOwnerWizard}
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500">Datum *</label>
                  <input
                    type="date"
                    name="scheduled_date"
                    required
                    defaultValue={todayIso()}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">Uhrzeit (optional)</label>
                  <input
                    type="time"
                    name="scheduled_time"
                    className={inputCls}
                    placeholder="z.B. 14:00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500">Typ *</label>
                  <select name="type" required className={inputCls} defaultValue="special">
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t.v} value={t.v}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500">Priorität</label>
                  <select name="priority" className={inputCls} defaultValue="normal">
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.v} value={p.v}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500">Reinigerin (optional)</label>
                <select name="staff_id" className={inputCls} defaultValue="">
                  <option value="">— später zuweisen —</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="linen_change" value="1" />
                  Bettwäsche wechseln
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="time_flexible" value="1" defaultChecked />
                  Zeitlich flexibel
                </label>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-500">
                    Zeitliche Vorgabe / Hinweis (nur wenn nicht flexibel)
                  </label>
                  <input
                    name="time_constraint_note"
                    placeholder="z.B. Eigentümer wünscht 10:00 zwingend"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500">
                  Effektive Reinigungszeit (Min) — bei externen Eigentümern empfohlen
                </label>
                <input
                  type="number"
                  name="estimated_duration_minutes"
                  className={inputCls}
                  placeholder="z.B. 90"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500">Notiz / Auftrag</label>
                <textarea
                  name="notes"
                  rows={3}
                  className={`${inputCls} font-mono text-xs`}
                  placeholder="z.B. Mieter ruft an, Wohnzimmer wegen verschüttetem Wein deep-cleanen"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Speichere…' : 'Auftrag anlegen'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function OwnerWizard({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-700">Neuer Eigentümer + Wohnung</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="owner_name"
          required
          placeholder="Name / Firma *"
          className={inputCls}
        />
        <input
          name="owner_phone"
          placeholder="Telefon"
          className={inputCls}
        />
        <input
          name="owner_email"
          type="email"
          placeholder="E-Mail"
          className={inputCls}
        />
        <input
          name="owner_address"
          placeholder="Adresse"
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="apartment_label"
          required
          placeholder="Wohnungs-Nr. (z.B. E.2203) *"
          className={inputCls}
        />
        <input
          name="apartment_address"
          placeholder="Adresse der Wohnung (falls anders)"
          className={inputCls}
        />
      </div>
      <input
        name="owner_notes"
        placeholder="Notiz (optional)"
        className={inputCls}
      />
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          Abbrechen
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            const form = (e.currentTarget.closest('form') ??
              e.currentTarget.closest('.space-y-2')?.parentElement?.querySelector('form'));
            // wir bauen das FormData manuell aus den nahegelegenen Inputs
            const wrapper = e.currentTarget.closest('.space-y-2') as HTMLElement | null;
            if (!wrapper) return;
            const fd = new FormData();
            wrapper.querySelectorAll('input').forEach((el) => {
              if (el.name) fd.set(el.name, el.value);
            });
            void form;
            onSubmit(fd);
          }}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? 'Speichere…' : 'Anlegen & weiter'}
        </button>
      </div>
    </div>
  );
}
