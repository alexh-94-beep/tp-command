'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  listFlatfoxApplications,
  type FlatfoxAppRow,
} from '@/server/flatfox/applications';
import { ImportDialog } from './import-dialog';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

export default function FlatfoxImportList() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<FlatfoxAppRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [onlyWithForm, setOnlyWithForm] = useState(true);
  const [dialogRow, setDialogRow] = useState<FlatfoxAppRow | null>(null);

  // Initial-Load + Reload bei Filter-Change via async IIFE (React-19-lint-konform).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listFlatfoxApplications({ onlyWithForm });
      if (cancelled) return;
      if (!r.ok) setError(r.error ?? 'Fehler beim Abrufen');
      else {
        setError(null);
        setRows(r.rows ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onlyWithForm]);

  function manualRefresh() {
    setError(null);
    startTransition(async () => {
      const r = await listFlatfoxApplications({ onlyWithForm });
      if (!r.ok) setError(r.error ?? 'Fehler beim Abrufen');
      else setRows(r.rows ?? []);
    });
  }

  function handleImportSuccess(message: string) {
    setImportMessage(message);
    setDialogRow(null);
    manualRefresh();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={manualRefresh} disabled={pending}>
            {pending && !rows ? 'Lade …' : 'Liste neu laden'}
          </Button>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={onlyWithForm}
              onChange={(e) => setOnlyWithForm(e.target.checked)}
            />
            Nur mit ausgefülltem Formular
          </label>
        </div>
        {rows && (
          <span className="text-xs text-slate-500">
            {rows.length} Anmeldung(en) ·{' '}
            {rows.filter((r) => !r.is_imported).length} noch nicht übernommen
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {importMessage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {importMessage}
        </div>
      )}

      {rows && rows.length === 0 && (
        <Card>
          <CardBody className="text-sm text-slate-500">
            Keine Anmeldungen vorhanden – sobald jemand auf Flatfox eine Anmeldung schickt,
            erscheint sie hier.
          </CardBody>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Hauptkontakt</th>
                <th className="px-4 py-3">Wohnung</th>
                <th className="px-4 py-3">Eingegangen</th>
                <th className="px-4 py-3 text-right">Bruttomiete</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.pk} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {r.first_name} {r.last_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.email}
                      {r.phone_number ? ` · ${r.phone_number}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.apartment_in_db_id ? (
                      <div className="font-medium">{r.apartment_number}</div>
                    ) : (
                      <div className="font-medium">
                        {r.apartment_number ?? '–'}{' '}
                        <Badge tone="warning">nicht in DB</Badge>
                      </div>
                    )}
                    <div className="text-xs text-slate-500">{r.apartment_label ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {r.form_submitted ? formatDate(r.form_submitted) : formatDate(r.created)}
                    {!r.has_form_data && (
                      <div className="text-xs text-amber-700">noch ohne Formular</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatMoney(r.rent_gross)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge tone="neutral">Flatfox: {r.status}</Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.is_imported && r.imported_booking_id ? (
                      <Link href={`/bookings/${r.imported_booking_id}`}>
                        <Button variant="secondary" size="sm">
                          Zur Buchung
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        size="sm"
                        variant={r.apartment_in_db_id ? 'primary' : 'secondary'}
                        onClick={() => setDialogRow(r)}
                      >
                        {r.apartment_in_db_id ? 'Übernehmen …' : 'Manuell zuordnen …'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialogRow && (
        <ImportDialog
          row={dialogRow}
          onClose={() => setDialogRow(null)}
          onSuccess={(r) =>
            handleImportSuccess(
              `Buchung erstellt, ${r.documentsStored ?? 0} Dokument(e) gespeichert.`,
            )
          }
        />
      )}
    </div>
  );
}
