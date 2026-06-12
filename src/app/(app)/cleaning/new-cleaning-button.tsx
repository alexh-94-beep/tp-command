'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createCleaningTask } from '@/server/cleaning/actions';
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
] as const;

const PRIORITY_OPTIONS = [
  { v: 'low', label: 'Niedrig' },
  { v: 'normal', label: 'Normal' },
  { v: 'high', label: 'Hoch' },
  { v: 'urgent', label: 'Dringend' },
] as const;

export default function NewCleaningButton({
  apartments,
  staff,
}: {
  apartments: Array<{ id: string; number: string }>;
  staff: Array<{ id: string; full_name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(form: FormData) {
    setError(null);
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
            className="w-full max-w-xl rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-semibold">Neuer Reinigungs-Auftrag</h2>
              <p className="mt-1 text-xs text-slate-500">
                Manuell, z.B. weil der Mieter über das Telefon eine Sonder-Reinigung
                angefragt hat.
              </p>
            </div>
            <div className="space-y-3 px-6 py-5">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-500">Wohnung *</label>
                <select name="apartment_id" required className={inputCls}>
                  <option value="">— Wohnung wählen —</option>
                  {apartments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.number}
                    </option>
                  ))}
                </select>
              </div>
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
                  <input
                    type="checkbox"
                    name="time_flexible"
                    value="1"
                    defaultChecked
                  />
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
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
