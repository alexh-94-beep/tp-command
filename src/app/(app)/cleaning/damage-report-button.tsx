'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function mondayIso(d: Date): string {
  const date = new Date(d);
  const dow = date.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function DamageReportButton() {
  const today = todayIso();
  const weekStart = mondayIso(new Date(today));
  const weekEnd = addDays(weekStart, 6);

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string>(weekStart);
  const [to, setTo] = useState<string>(weekEnd);
  const [includePhotos, setIncludePhotos] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  function setPreset(preset: 'today' | 'week' | 'last-week' | 'month') {
    const t = todayIso();
    if (preset === 'today') {
      setFrom(t);
      setTo(t);
    } else if (preset === 'week') {
      const ws = mondayIso(new Date(t));
      setFrom(ws);
      setTo(addDays(ws, 6));
    } else if (preset === 'last-week') {
      const ws = mondayIso(new Date(t));
      const lws = addDays(ws, -7);
      setFrom(lws);
      setTo(addDays(lws, 6));
    } else if (preset === 'month') {
      const d = new Date(t);
      const start = new Date(d.getFullYear(), d.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);
      setFrom(start);
      setTo(end);
    }
  }

  const href = `/api/cleaning/damage-report-pdf?from=${from}&to=${to}${includePhotos ? '' : '&photos=0'}`;

  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" type="button" onClick={() => setOpen((v) => !v)}>
        <AlertTriangle className="h-4 w-4" />
        Schadensreport
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[340px] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="text-sm font-semibold text-slate-900">Schadensreport für Cityus</div>
          <div className="mt-1 text-xs text-slate-500">
            Sammelt alle Inspektionen mit gemeldetem Schaden im gewählten Zeitraum.
          </div>

          <div className="mt-3 flex flex-wrap gap-1 text-xs">
            {[
              { v: 'today', label: 'Heute' },
              { v: 'week', label: 'Diese Woche' },
              { v: 'last-week', label: 'Letzte Woche' },
              { v: 'month', label: 'Dieser Monat' },
            ].map((p) => (
              <button
                key={p.v}
                type="button"
                onClick={() => setPreset(p.v as 'today' | 'week' | 'last-week' | 'month')}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:bg-slate-100"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">Von</label>
              <DateInput name="from" value={from} onChange={setFrom} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Bis</label>
              <DateInput name="to" value={to} onChange={setTo} />
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => setIncludePhotos(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Fotos einbetten (max. 6 pro Wohnung)
          </label>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Abbrechen
            </button>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              <FileDown className="h-3.5 w-3.5" />
              PDF öffnen
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
