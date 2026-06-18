'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { importParkingSpiegel } from '@/server/parking/actions';

type Result = Awaited<ReturnType<typeof importParkingSpiegel>>;

export default function ParkingImportForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [file, setFile] = useState<File | null>(null);

  function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.set('file', file);
    startTransition(async () => {
      const r = await importParkingSpiegel(fd);
      setResult(r);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>XLS-Upload</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4 text-sm">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="font-medium text-slate-800">Was wird importiert</div>
          <ul className="mt-1 list-disc pl-5">
            <li>
              <strong>parking_spots</strong> — pro PP-Nummer angelegt (Liegenschaft
              aus W&amp;W). Fehlende Nrn im Range werden als Leerstand-PP angelegt.
            </li>
            <li>
              <strong>Dauer-Mietverhältnisse</strong> aus W&amp;W (Mieter,
              Verhältnis-Zeitraum, Netto-Miete).
            </li>
            <li>
              <strong>Nicht überschrieben:</strong> Booking-Belegungen,
              is_booking_pool-Flag, interne Notizen.
            </li>
          </ul>
        </div>

        <input
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />

        <Button onClick={submit} disabled={pending || !file}>
          <Upload className="h-4 w-4" />
          {pending ? 'Importiere …' : 'Import starten'}
        </Button>

        {result && (
          <div
            className={`rounded-md border p-3 text-sm ${
              result.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {result.ok ? (
              <div className="space-y-1">
                <div>
                  ✓ Import erfolgreich
                  {result.exportDate && ` (Stand W&W: ${result.exportDate})`}
                </div>
                <ul className="ml-4 list-disc text-xs">
                  <li>
                    PPs: <strong>{result.spotsInserted}</strong> neu,{' '}
                    <strong>{result.spotsUpdated}</strong> aktualisiert
                  </li>
                  <li>
                    Leerstand-PPs (ohne W&W-Eintrag):{' '}
                    <strong>{result.gapsInserted}</strong> neu
                  </li>
                  <li>
                    Mietverhältnisse: <strong>{result.assignmentsInserted}</strong>{' '}
                    neu, <strong>{result.assignmentsUpdated}</strong> aktualisiert,{' '}
                    <strong>{result.assignmentsDeactivated}</strong> deaktiviert
                  </li>
                  {result.gaps && result.gaps.length > 0 && (
                    <li>
                      Erkannte Lücken im W&W-Export: {result.gaps.join(', ')}
                    </li>
                  )}
                  {result.errors && result.errors.length > 0 && (
                    <li className="text-amber-800">
                      Warnungen ({result.errors.length}): {result.errors.slice(0, 3).join('; ')}
                      {result.errors.length > 3 && ' …'}
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <>Fehler: {result.error}</>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
