'use client';

import { useState, useTransition } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { flatfoxConnectionTest, flatfoxRawFetch } from '@/server/flatfox/test';
import { inspectFlatfoxZip, type InspectZipResult } from '@/server/flatfox/inspect-zip';

interface EndpointR {
  ok: boolean;
  status: number;
  url: string;
  error?: string;
  data?: unknown;
}

interface TestResult {
  applications: EndpointR;
  listings: EndpointR;
  env: { hasToken: boolean; apiUrl: string };
}

export default function FlatfoxTester() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestResult | null>(null);
  const [rawPath, setRawPath] = useState('/application/?limit=5');
  const [rawResult, setRawResult] = useState<EndpointR | null>(null);
  const [zipPath, setZipPath] = useState('');
  const [zipResult, setZipResult] = useState<InspectZipResult | null>(null);

  function runConnectionTest() {
    setResult(null);
    startTransition(async () => {
      const r = await flatfoxConnectionTest();
      setResult(r);
    });
  }

  function runRaw() {
    setRawResult(null);
    startTransition(async () => {
      const r = await flatfoxRawFetch(rawPath);
      setRawResult(r);
    });
  }

  function runZipInspect() {
    setZipResult(null);
    startTransition(async () => {
      const r = await inspectFlatfoxZip(zipPath);
      setZipResult(r);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Verbindungs-Test</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Button onClick={runConnectionTest} disabled={pending}>
            {pending && !result ? 'Teste …' : 'Verbindung testen'}
          </Button>
          {result && (
            <div className="space-y-2 text-sm">
              <div>
                Token gesetzt:{' '}
                {result.env.hasToken ? (
                  <Badge tone="success">Ja</Badge>
                ) : (
                  <Badge tone="danger">Nein – FLATFOX_API_TOKEN prüfen</Badge>
                )}
              </div>
              <div>
                API URL: <code>{result.env.apiUrl}</code>
              </div>
              <EndpointResult title="Applications" r={result.applications} />
              <EndpointResult title="Listings" r={result.listings} />
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Beliebigen Endpoint testen</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={rawPath}
              onChange={(e) => setRawPath(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              placeholder="/application/?limit=5"
            />
            <Button onClick={runRaw} disabled={pending}>
              GET
            </Button>
          </div>
          {rawResult && <EndpointResult title="Rohanfrage" r={rawResult} />}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ZIP-Dossier inspizieren</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-slate-500">
            Pfad zum Summary-ZIP aus einer Application (z. B. <code>/application/123/zip/</code>).
            Listet Dateinamen, Grösse, Typ und Vorschau für JSON/Text.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={zipPath}
              onChange={(e) => setZipPath(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              placeholder="/application/<pk>/zip/"
            />
            <Button onClick={runZipInspect} disabled={pending || !zipPath}>
              Inspizieren
            </Button>
          </div>
          {zipResult && <ZipResult r={zipResult} />}
        </CardBody>
      </Card>
    </div>
  );
}

function EndpointResult({ title, r }: { title: string; r: EndpointR }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">{title}</div>
        <Badge tone={r.ok ? 'success' : 'danger'}>HTTP {r.status}</Badge>
      </div>
      <div className="mt-1 font-mono text-xs break-all text-slate-500">{r.url}</div>
      {r.error && (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-red-50 p-2 text-xs text-red-800">
          {r.error}
        </pre>
      )}
      {r.data != null && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-700">Antwort anzeigen</summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-50 p-2 text-xs">
            {JSON.stringify(r.data, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function ZipResult({ r }: { r: InspectZipResult }) {
  if (!r.ok) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        HTTP {r.status} · {r.error ?? 'Unbekannter Fehler'}
      </div>
    );
  }
  const files = r.files ?? [];
  return (
    <div className="rounded-md border border-slate-200 p-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium">
          {files.length} Datei{files.length === 1 ? '' : 'en'} im ZIP
        </div>
        <Badge tone="success">{r.size ? `${(r.size / 1024).toFixed(0)} KB` : ''}</Badge>
      </div>
      <ul className="mt-3 space-y-2">
        {files.map((f) => (
          <li key={f.name} className="rounded border border-slate-100 p-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs">{f.name}</span>
              <span className="text-xs text-slate-500">
                {f.type} · {(f.size / 1024).toFixed(1)} KB
              </span>
            </div>
            {f.preview && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-slate-700">Vorschau</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs">
                  {f.preview}
                </pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
