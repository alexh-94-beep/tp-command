'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  previewApartmentsImport,
  commitApartmentsImport,
  type ImportPreviewResult,
} from '@/server/apartments/import';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function ImportWizard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [mode, setMode] = useState<'new_only' | 'upsert'>('new_only');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ inserted: number; updated: number } | null>(null);

  // Wenn die Erfolgsbox erscheint oder die Vorschau fertig ist, im
  // Scroll-Container des App-Layouts nach ganz oben scrollen, damit nichts
  // unter der Topbar verschwindet.
  useEffect(() => {
    if (done || preview) {
      const main = document.querySelector('main');
      main?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [done, preview]);

  function handlePreview() {
    if (!file) return;
    setError(null);
    setDone(null);
    const fd = new FormData();
    fd.append('file', file);
    startTransition(async () => {
      const res = await previewApartmentsImport(fd);
      if (!res.ok) {
        setError(res.error ?? 'Unbekannter Fehler');
        setPreview(null);
      } else {
        setPreview(res);
      }
    });
  }

  function handleCommit() {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', mode);
    startTransition(async () => {
      const res = await commitApartmentsImport(fd);
      if (!res.ok) {
        setError(res.error ?? 'Unbekannter Fehler');
      } else {
        setDone({ inserted: res.inserted ?? 0, updated: res.updated ?? 0 });
        setPreview(null);
        setFile(null);
        router.refresh();
      }
    });
  }

  /* ----- erfolgsmeldung ----- */
  if (done) {
    return (
      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xl text-white">
            ✓
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-emerald-900">Import abgeschlossen</h2>
            <p className="mt-1 text-sm text-emerald-800">
              <strong>{done.inserted}</strong> neue Wohnungen angelegt
              {done.updated > 0 && (
                <>
                  , <strong>{done.updated}</strong> aktualisiert
                </>
              )}
              .
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => router.push('/apartments')}>Zur Wohnungsliste</Button>
              <Button variant="secondary" onClick={() => setDone(null)}>
                Weitere Datei importieren
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Schritt 1: Datei wählen */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Schritt 1 – Datei wählen
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
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
          <Button onClick={handlePreview} disabled={!file || pending}>
            {pending && !preview ? 'Analysiere …' : 'Vorschau anzeigen'}
          </Button>
        </div>
        {file && (
          <p className="mt-2 text-xs text-slate-500">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Schritt 2: Vorschau */}
      {preview?.ok && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Schritt 2 – Vorschau
          </h2>

          <div className="flex flex-wrap gap-2">
            <Badge tone="info">Gesamt: {preview.totalRows}</Badge>
            <Badge tone="success">Neu: {preview.newRows}</Badge>
            <Badge tone="warning">Bereits vorhanden: {preview.existingRows}</Badge>
            {preview.warnings && preview.warnings.length > 0 && (
              <Badge tone="danger">Warnungen: {preview.warnings.length}</Badge>
            )}
          </div>

          {preview.warnings && preview.warnings.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-700">
                {preview.warnings.length} Warnung(en) anzeigen
              </summary>
              <ul className="mt-2 space-y-1">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="text-amber-700">
                    Zeile {w.rowNumber} – {w.field}: {w.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Zeile</th>
                  <th className="px-3 py-2">Nr.</th>
                  <th className="px-3 py-2">Typ</th>
                  <th className="px-3 py-2">Etage</th>
                  <th className="px-3 py-2">Ausrichtung</th>
                  <th className="px-3 py-2 text-right">Miete</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Eigentum</th>
                  <th className="px-3 py-2">In DB?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.preview!.map((r) => (
                  <tr key={r.number} className={r.exists ? 'bg-amber-50/50' : ''}>
                    <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                    <td className="px-3 py-2 font-medium">{r.number}</td>
                    <td className="px-3 py-2 capitalize">{r.type}</td>
                    <td className="px-3 py-2">{r.floor}</td>
                    <td className="px-3 py-2">{r.orientation}</td>
                    <td className="px-3 py-2 text-right">{r.standard_rent}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{r.ownership}</td>
                    <td className="px-3 py-2">
                      {r.exists ? (
                        <Badge tone="warning">vorhanden</Badge>
                      ) : (
                        <Badge tone="success">neu</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Schritt 3: Modus + Commit */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-medium text-slate-700">Schritt 3 – Schreibmodus</h3>
            <div className="mt-2 space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'new_only'}
                  onChange={() => setMode('new_only')}
                  className="mt-1"
                />
                <span>
                  <strong>Nur neue anlegen</strong> – bestehende Wohnungen
                  bleiben unverändert. Sicher für den ersten Import.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'upsert'}
                  onChange={() => setMode('upsert')}
                  className="mt-1"
                />
                <span>
                  <strong>Aktualisieren (Upsert)</strong> – neue anlegen, bestehende mit
                  den Werten aus dem Excel überschreiben.
                </span>
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreview(null)}>
                Abbrechen
              </Button>
              <Button onClick={handleCommit} disabled={pending}>
                {pending ? 'Importiere …' : 'Import durchführen'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
