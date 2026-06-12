'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  applyCityusImport,
  previewCityusImport,
  type CityusPreviewRow,
} from '@/server/cleaning/cityus-import';
import { formatDate, todayIso } from '@/lib/dates';

const TYPE_LABEL: Record<string, string> = {
  checkout: 'Final Clean',
  weekly_clean: 'Weekly Clean',
  weekly_clean_linen: 'Weekly + Bettwäsche',
  special: 'Spezial',
};

export default function CityusImportButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<CityusPreviewRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const today = todayIso();

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set('file', file);
    setError(null);
    setSummary(null);
    setRows(null);
    setWarnings([]);
    startTransition(async () => {
      const r = await previewCityusImport(fd);
      if (!r.ok) {
        setError(r.error ?? 'Datei konnte nicht gelesen werden.');
        return;
      }
      setRows(r.rows ?? []);
      setWarnings(r.warnings ?? []);
    });
  }

  function handleApply() {
    if (!rows) return;
    if (!confirm('Plan jetzt übernehmen?')) return;
    setError(null);
    startTransition(async () => {
      const r = await applyCityusImport(JSON.stringify(rows));
      if (!r.ok) {
        setError(r.error ?? 'Fehler beim Übernehmen.');
        return;
      }
      setSummary(
        `${r.created} neue Aufträge angelegt · ` +
          `${r.removed} entfernt (nicht mehr im Plan) · ` +
          `${r.skippedPast} übersprungen (in der Vergangenheit) · ` +
          `${r.skippedUnknown} unbekannte Wohnung(en)`,
      );
      setRows(null);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        Cityus-Plan importieren
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-semibold">Cityus-Wochenplan importieren</h2>
              <p className="mt-1 text-xs text-slate-500">
                Lade die wöchentliche Excel-Datei hoch. Nur Einträge im
                Wochentags-Bereich werden übernommen, vergangene Aufträge bleiben
                unangetastet.
              </p>
            </div>

            <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}
              {summary && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircle2 className="mr-1 inline h-4 w-4" />
                  {summary}
                </div>
              )}

              {!rows && !summary && (
                <label className="flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100">
                  <div className="text-center">
                    <Upload className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-2 text-sm text-slate-600">
                      Excel-Datei auswählen (.xlsx)
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFile}
                    className="sr-only"
                    disabled={pending}
                  />
                </label>
              )}

              {warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <strong>{warnings.length} Hinweis(e):</strong>
                  <ul className="mt-1 list-disc pl-5">
                    {warnings.slice(0, 8).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {warnings.length > 8 && (
                      <li>…und {warnings.length - 8} weitere.</li>
                    )}
                  </ul>
                </div>
              )}

              {rows && rows.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-100 text-xs">
                    <thead className="bg-slate-50 text-left tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th className="px-3 py-2">Datum</th>
                        <th className="px-3 py-2">Wohnung</th>
                        <th className="px-3 py-2">Typ</th>
                        <th className="px-3 py-2">Gast</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r, i) => {
                        const isPast = r.date < today;
                        const hasIssue = !r.apartment_id;
                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 whitespace-nowrap">
                              {formatDate(r.date)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap font-medium">
                              {r.apartmentNumber ?? r.cityusApartment}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {TYPE_LABEL[r.type] ?? r.type}
                              {r.linen_change && (
                                <Badge tone="info" className="ml-2">
                                  Wäsche
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2">{r.guestName ?? '–'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {hasIssue ? (
                                <Badge tone="danger">unbekannt</Badge>
                              ) : isPast ? (
                                <Badge tone="neutral">Vergangenheit</Badge>
                              ) : r.existsAlready ? (
                                <Badge tone="neutral">existiert</Badge>
                              ) : (
                                <Badge tone="success">neu</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {rows && rows.length === 0 && (
                <p className="text-sm text-slate-500">Keine Einträge gefunden.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {summary ? 'Schließen' : 'Abbrechen'}
              </Button>
              {rows && rows.length > 0 && !summary && (
                <Button onClick={handleApply} disabled={pending}>
                  {pending ? 'Übernehme…' : 'Plan übernehmen'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
