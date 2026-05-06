'use client';

import { useState, useTransition } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { flatfoxConnectionTest, flatfoxRawFetch } from '@/server/flatfox/test';
import { inspectFlatfoxZip, type InspectZipResult } from '@/server/flatfox/inspect-zip';

interface TestResult {
  applications: { ok: boolean; status: number; url: string; error?: string; data?: unknown; authStyle?: string };
  listings: { ok: boolean; status: number; url: string; error?: string; data?: unknown; authStyle?: string };
  env: { hasToken: boolean; apiUrl: string };
}

interface RawResult {
  ok: boolean;
  status: number;
  url: string;
  error?: string;
  data?: unknown;
  authStyle?: string;
}

export default function FlatfoxTester() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestResult | null>(null);
  const [rawPath, setRawPath] = useState('/applications/');
  const [rawResult, setRawResult] = useState<RawResult | null>(null);

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
                  <Badge tone="danger">Nein – .env.local prüfen</Badge>
                )}
              </div>
              <div>API URL: <code>{result.env.apiUrl}</code></div>
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
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
              placeholder="/applications/?limit=5"
            />
            <Button onClick={runRaw} disabled={pending}>
              GET
            </Button>
          </div>
          {rawResult && <EndpointResult title="Rohanfrage" r={rawResult} />}
        </CardBody>
      </Card>
    </div>
  );
}

function EndpointResult({
  title,
  r,
}: {
  title: string;
  r: { ok: boolean; status: number; url: string; error?: string; data?: unknown; authStyle?: string };
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">{title}</div>
        <div className="flex items-center gap-2">
          {r.authStyle && <Badge tone="neutral">Auth: {r.authStyle}</Badge>}
          <Badge tone={r.ok ? 'success' : 'danger'}>HTTP {r.status}</Badge>
        </div>
      </div>
      <div className="mt-1 break-all font-mono text-xs text-slate-500">{r.url}</div>
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
