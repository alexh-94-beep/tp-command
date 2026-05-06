'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { previewCityusPlan, commitCityusPlan, type CityusPreview } from '@/server/cleaning/cityus-import';
import { formatDate } from '@/lib/dates';

export default function CityusImportWizard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CityusPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [resultErrors, setResultErrors] = useState<string[]>([]);

  function runPreview() {
    if (!file) return;
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    startTransition(async () => {
      const r = await previewCityusPlan(fd);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else setPreview(r);
    });
  }

  function runCommit() {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    startTransition(async () => {
      const r = await commitCityusPlan(fd);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      setResult(
        `${r.staysInserted ?? 0} neue Aufenthalte, ${r.staysUpdated ?? 0} aktualisiert, ${r.cleaningTasksCreated ?? 0} Reinigungs-Aufträge + ${r.weeklyTasksCreated ?? 0} wöchentliche erzeugt.${
          r.errors && r.errors.length > 0 ? ` ${r.errors.length} Fehler.` : ''
        }`,
      );
      setResultErrors(r.errors ?? []);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Schritt 1 – Datei wählen</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
              className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
            />
            <Button onClick={runPreview} disabled={!file || pending}>
              {pending && !preview ? 'Lese …' : 'Vorschau'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {result}
          </div>
          {resultErrors.length > 0 && (
            <details
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              open
            >
              <summary className="cursor-pointer font-medium">
                {resultErrors.length} Fehler beim Import – anzeigen
              </summary>
              <ul className="mt-2 space-y-1 text-xs">
                {resultErrors.map((e, i) => (
                  <li key={i} className="font-mono">{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {preview?.ok && preview.parsed && preview.perRow && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                Schritt 2 – Vorschau {preview.weekRange ? `(${preview.weekRange})` : ''}
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge tone="info">{preview.parsed.stays.length} Aufenthalte</Badge>
                <Badge tone="info">{preview.parsed.weeklyTasks.length} wöchentliche Reinigungen</Badge>
                {preview.warnings && preview.warnings.length > 0 && (
                  <Badge tone="danger">{preview.warnings.length} Warnungen</Badge>
                )}
              </div>

              {preview.warnings && preview.warnings.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm text-slate-700">
                    Warnungen anzeigen
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-amber-700">
                    {preview.warnings.map((w, i) => (
                      <li key={i}>
                        Zeile {w.rowNumber}: {w.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Wohnung</th>
                      <th className="px-3 py-2">Gast</th>
                      <th className="px-3 py-2">Anreise</th>
                      <th className="px-3 py-2">Abreise</th>
                      <th className="px-3 py-2">Cityus-Buchung?</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.perRow.map((r, i) => (
                      <tr
                        key={i}
                        className={
                          !r.apartment_in_db ? 'bg-red-50/40' : r.existing_stay ? 'bg-amber-50/30' : ''
                        }
                      >
                        <td className="px-3 py-2 font-medium">{r.row.apartment_number}</td>
                        <td className="px-3 py-2">{r.row.guest_name}</td>
                        <td className="px-3 py-2">
                          {r.row.check_in_date ? formatDate(r.row.check_in_date) : '–'}
                        </td>
                        <td className="px-3 py-2">
                          {r.row.check_out_date ? formatDate(r.row.check_out_date) : '–'}
                        </td>
                        <td className="px-3 py-2">
                          {r.parent_booking_id ? (
                            <Badge tone="success">verknüpft</Badge>
                          ) : (
                            <span className="text-slate-400">keine aktive</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {!r.apartment_in_db ? (
                            <Badge tone="danger">Wohnung fehlt</Badge>
                          ) : r.existing_stay ? (
                            <Badge tone="warning">aktualisiert</Badge>
                          ) : (
                            <Badge tone="success">neu</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.weeklyRows && preview.weeklyRows.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-slate-700">
                    Wöchentliche Reinigungen ({preview.weeklyRows.length})
                  </h3>
                  <div className="max-h-72 overflow-auto rounded-md border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Datum</th>
                          <th className="px-3 py-2">Wohnung</th>
                          <th className="px-3 py-2">Gast</th>
                          <th className="px-3 py-2">Typ</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {preview.weeklyRows.map((w, i) => (
                          <tr
                            key={i}
                            className={
                              !w.apartment_in_db
                                ? 'bg-red-50/40'
                                : w.duplicate
                                  ? 'bg-amber-50/30'
                                  : ''
                            }
                          >
                            <td className="px-3 py-2 whitespace-nowrap">{formatDate(w.date)}</td>
                            <td className="px-3 py-2 font-medium">{w.apartment_number}</td>
                            <td className="px-3 py-2">{w.guest_name || '–'}</td>
                            <td className="px-3 py-2">
                              {w.task_type === 'weekly_clean_linen' ? (
                                <Badge tone="info">Wöchentlich + Bettwäsche</Badge>
                              ) : (
                                <Badge tone="neutral">Wöchentlich</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {!w.apartment_in_db ? (
                                <Badge tone="danger">Wohnung fehlt</Badge>
                              ) : w.duplicate ? (
                                <Badge tone="warning">bereits vorhanden</Badge>
                              ) : (
                                <Badge tone="success">neu</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button onClick={runCommit} disabled={pending}>
                  {pending ? 'Importiere …' : 'Import durchführen'}
                </Button>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
