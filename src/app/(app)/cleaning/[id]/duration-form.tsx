'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { saveActualDuration } from '@/server/cleaning/actions';

const inputCls =
  'mt-1 block w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

function fmt(min: number | null): string {
  if (!min) return '–';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h}:${String(m).padStart(2, '0')} h`;
}

export default function DurationForm({
  taskId,
  estimatedMinutes,
  actualMinutes,
}: {
  taskId: string;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<string>(actualMinutes ? String(actualMinutes) : '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(false);
    const n = value.trim() === '' ? null : Number(value);
    if (n !== null && (Number.isNaN(n) || n < 0)) {
      setError('Bitte eine positive Zahl eingeben (Minuten).');
      return;
    }
    startTransition(async () => {
      const r = await saveActualDuration(taskId, n);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-medium text-slate-700">Aufwand</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">Geschätzt</div>
          <div>{fmt(estimatedMinutes)}</div>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Effektiv (Min)</label>
          <div className="flex items-end gap-2">
            <input
              type="number"
              min="0"
              className={inputCls}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={estimatedMinutes ? String(estimatedMinutes) : ''}
            />
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? 'Speichere …' : 'Speichern'}
            </Button>
          </div>
          {saved && <p className="mt-1 text-xs text-emerald-700">✓ Gespeichert</p>}
          {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Trag den effektiven Aufwand am Ende des Tages ein – wichtig für Stundenlohn-Personen
        (z.B. Bidet) und für die laufende Anpassung der Schätzungen.
      </p>
    </div>
  );
}
