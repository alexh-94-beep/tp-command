'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { saveInspection } from '@/server/cleaning/actions';

const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

interface Props {
  taskId: string;
  damageFound: boolean | null;
  damageDescription: string | null;
  inspectionSummary: string | null;
}

export default function InspectionForm({
  taskId,
  damageFound,
  damageDescription,
  inspectionSummary,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [damage, setDamage] = useState<boolean>(damageFound ?? false);
  const [desc, setDesc] = useState(damageDescription ?? '');
  const [summary, setSummary] = useState(inspectionSummary ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await saveInspection({
        taskId,
        damageFound: damage,
        damageDescription: desc,
        inspectionSummary: summary,
      });
      if (!r.ok) setError(r.error ?? 'Fehler');
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inspektions-Protokoll</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Schäden festgestellt?</label>
          <div className="mt-2 flex gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={!damage} onChange={() => setDamage(false)} />
              Nein
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={damage} onChange={() => setDamage(true)} />
              Ja
            </label>
          </div>
        </div>

        {damage && (
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Beschreibung Schäden / fehlende Items
            </label>
            <textarea
              className={`${inputCls} min-h-[100px]`}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="z. B. Glasplatte Couchtisch zerkratzt, Tasse fehlt, Bettwäsche dreckig…"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Allgemeine Zusammenfassung (Sauberkeitsgrad, Rückgabe-Zustand)
          </label>
          <textarea
            className={`${inputCls} min-h-[80px]`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="z. B. Wohnung in gutem Zustand, leichter Schmutz im Bad."
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? 'Speichere …' : 'Inspektion speichern'}
          </Button>
          {saved && <span className="text-xs text-emerald-700">✓ Gespeichert</span>}
          {error && <span className="text-xs text-red-700">{error}</span>}
        </div>

        <p className="text-xs text-slate-500">
          Schäden werden tagesweise gesammelt und können als PDF an Cityus exportiert werden.
        </p>
      </CardBody>
    </Card>
  );
}
