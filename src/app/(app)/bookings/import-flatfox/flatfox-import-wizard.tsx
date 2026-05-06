'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateInput } from '@/components/ui/date-input';
import {
  previewFlatfoxApplication,
  commitFlatfoxApplication,
  type FlatfoxPreviewResult,
} from '@/server/bookings/import-flatfox';
import { checkBookingAvailability } from '@/server/bookings/check';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { AvailabilityResult } from '@/services/availability/check';

const labelCls = 'block text-sm font-medium text-slate-700';
const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function FlatfoxImportWizard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FlatfoxPreviewResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ bookingId: string; tenantsCreated: number } | null>(null);

  // Konditionen-Felder, die der User bearbeiten kann
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [contractStatus, setContractStatus] = useState<'draft' | 'sent' | 'signed'>('signed');
  const [bookingStatus, setBookingStatus] = useState<'planned' | 'active'>('planned');
  const [notes, setNotes] = useState('');

  // Live-Verfügbarkeitsprüfung in Schritt 3
  const [liveAvailability, setLiveAvailability] = useState<AvailabilityResult | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  // Vorschau-Werte ins Form übernehmen
  useEffect(() => {
    if (!preview?.parsed) return;
    if (preview.parsed.desired_move_in) setStartDate(preview.parsed.desired_move_in);
    if (preview.parsed.rent_gross) setRentAmount(String(preview.parsed.rent_gross));
  }, [preview]);

  // Verfügbarkeit live checken, wenn der User Datum ändert
  useEffect(() => {
    if (!preview?.matchedApartmentId || !startDate) {
      setLiveAvailability(null);
      return;
    }
    setCheckingAvailability(true);
    const handle = setTimeout(async () => {
      try {
        const r = await checkBookingAvailability({
          apartmentId: preview.matchedApartmentId!,
          startDate,
          endDate: endDate || '9999-12-31',
        });
        setLiveAvailability(r);
      } finally {
        setCheckingAvailability(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [startDate, endDate, preview?.matchedApartmentId]);

  function handlePreview() {
    if (!file) return;
    setError(null);
    setDone(null);
    const fd = new FormData();
    fd.append('file', file);
    startTransition(async () => {
      const res = await previewFlatfoxApplication(fd);
      if (!res.ok) {
        setError(res.error ?? 'Unbekannter Fehler');
        setPreview(null);
      } else {
        setPreview(res);
      }
    });
  }

  function handleCommit() {
    if (!preview?.parsed || !preview.matchedApartmentId || !file) return;
    setError(null);
    startTransition(async () => {
      // PDF mitschicken zum Speichern als Anhang
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((acc, b) => acc + String.fromCharCode(b), ''),
      );
      const res = await commitFlatfoxApplication({
        apartmentId: preview.matchedApartmentId,
        startDate,
        endDate: endDate || undefined,
        rentAmount: Number(rentAmount) || 0,
        depositAmount: Number(depositAmount) || 0,
        contractStatus,
        bookingStatus,
        notes,
        parsed: preview.parsed,
        pdfBase64: base64,
        pdfFilename: file.name,
      });
      if (!res.ok) {
        setError(res.error ?? 'Unbekannter Fehler');
      } else {
        setDone({ bookingId: res.bookingId!, tenantsCreated: res.tenantsCreated ?? 0 });
      }
    });
  }

  // ---- Erfolgsbox ----
  if (done) {
    return (
      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xl text-white">
            ✓
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-emerald-900">Anmeldung importiert</h2>
            <p className="mt-1 text-sm text-emerald-800">
              <strong>{done.tenantsCreated}</strong> Mieter angelegt, Buchung erstellt.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => router.push(`/bookings/${done.bookingId}`)}>
                Zur Buchung
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDone(null);
                  setFile(null);
                  setPreview(null);
                }}
              >
                Weitere PDF importieren
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
      <Card>
        <CardHeader>
          <CardTitle>Schritt 1 – PDF wählen</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
              className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
            />
            <Button onClick={handlePreview} disabled={!file || pending}>
              {pending && !preview ? 'Lese PDF …' : 'PDF analysieren'}
            </Button>
          </div>
          {file && (
            <p className="mt-2 text-xs text-slate-500">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Schritt 2: Vorschau */}
      {preview?.parsed && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Schritt 2 – Was wir gefunden haben</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {/* Wohnungs-Match */}
              <div className="flex items-start justify-between gap-4 rounded-md border border-slate-200 p-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Wohnung</div>
                  <div className="mt-0.5 text-sm font-medium">
                    {preview.parsed.apartment_label ?? '–'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Referenz aus PDF: {preview.apartmentNumberFound ?? '–'}
                  </div>
                </div>
                <div>
                  {preview.matchedApartmentId ? (
                    <Badge tone="success">In DB gefunden</Badge>
                  ) : (
                    <Badge tone="danger">Nicht zugeordnet</Badge>
                  )}
                </div>
              </div>

              {/* Eckdaten */}
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-slate-500">Bruttomiete</div>
                  <div>{formatMoney(preview.parsed.rent_gross)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Bezugstermin gewünscht</div>
                  <div>
                    {preview.parsed.desired_move_in
                      ? formatDate(preview.parsed.desired_move_in)
                      : '–'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Grund Umzug</div>
                  <div>{preview.parsed.reason_for_move ?? '–'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Erwachsene / Kinder</div>
                  <div>
                    {preview.parsed.adults ?? '–'} / {preview.parsed.children ?? '–'}
                  </div>
                </div>
              </div>

              {preview.parsed.remarks && (
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <strong>Bemerkung:</strong> {preview.parsed.remarks}
                </div>
              )}

              {/* Verfügbarkeit */}
              {preview.availability && (
                <div
                  className={`rounded-md border p-3 text-sm ${
                    preview.availability.available
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  {preview.availability.available ? (
                    '✓ Wohnung ist ab gewünschtem Bezugstermin frei.'
                  ) : (
                    <>
                      <p className="font-medium">
                        Konflikt im Zeitraum ({preview.availability.conflicts.length}):
                      </p>
                      <ul className="mt-1 list-inside list-disc">
                        {preview.availability.conflicts.map((c, i) => (
                          <li key={i}>
                            {c.label} – {formatDate(c.start_date)} bis {formatDate(c.end_date)}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {/* Bewerber */}
              <div>
                <h3 className="mb-2 text-sm font-medium">
                  Bewerber ({preview.parsed.applicants.length})
                </h3>
                <div className="space-y-2">
                  {preview.parsed.applicants.map((a, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-slate-200 p-3 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {a.first_name} {a.last_name}
                        </div>
                        <Badge tone={i === 0 ? 'info' : 'neutral'}>
                          {i === 0 ? 'Hauptmieter' : a.relationship ?? 'Mitbewohner'}
                        </Badge>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
                        <div>{a.email ?? '–'}</div>
                        <div>{a.phone ?? '–'}</div>
                        <div>
                          {a.date_of_birth ? formatDate(a.date_of_birth) : '–'}
                        </div>
                        <div>{a.nationality ?? '–'}</div>
                        <div>Beruf: {a.profession ?? '–'}</div>
                        <div>Arbeitgeber: {a.employer ?? '–'}</div>
                        <div>
                          Einkommen: {a.annual_income ? formatMoney(a.annual_income) : '–'}
                        </div>
                        <div>
                          Betreibung:{' '}
                          {a.has_debt_collection === null
                            ? '–'
                            : a.has_debt_collection
                              ? 'Ja'
                              : 'Nein'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {preview.parsed.attachments.length > 0 && (
                <div className="text-xs text-slate-500">
                  Im PDF erwähnte Anhänge: {preview.parsed.attachments.join(', ')}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Schritt 3: Konditionen + Speichern */}
          {preview.matchedApartmentId && (
            <Card>
              <CardHeader>
                <CardTitle>Schritt 3 – Buchung erstellen</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div>
                    <label className={labelCls}>Einzug</label>
                    <DateInput
                      name="start_date"
                      value={startDate}
                      onChange={setStartDate}
                      className="mt-1"
                      required
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      Auszug{' '}
                      <span className="text-slate-400">(leer = unbefristet)</span>
                    </label>
                    <DateInput
                      name="end_date"
                      value={endDate}
                      onChange={setEndDate}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Mietzins (CHF)</label>
                    <input
                      type="number"
                      step="0.01"
                      className={inputCls}
                      value={rentAmount}
                      onChange={(e) => setRentAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Depot (CHF)</label>
                    <input
                      type="number"
                      step="0.01"
                      className={inputCls}
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Vertragsstatus</label>
                    <select
                      className={inputCls}
                      value={contractStatus}
                      onChange={(e) => setContractStatus(e.target.value as 'draft' | 'sent' | 'signed')}
                    >
                      <option value="draft">Entwurf</option>
                      <option value="sent">Versendet</option>
                      <option value="signed">Unterschrieben</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Buchungsstatus</label>
                    <select
                      className={inputCls}
                      value={bookingStatus}
                      onChange={(e) => setBookingStatus(e.target.value as 'planned' | 'active')}
                    >
                      <option value="planned">Geplant</option>
                      <option value="active">Aktiv</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Notizen (optional)</label>
                  <textarea
                    className={`${inputCls} min-h-[80px]`}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Live-Verfügbarkeit für die aktuell eingegebenen Daten */}
                {startDate && (
                  <div
                    className={`rounded-md border p-3 text-sm ${
                      checkingAvailability
                        ? 'border-slate-200 bg-slate-50 text-slate-600'
                        : liveAvailability?.available
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    {checkingAvailability && 'Prüfe Verfügbarkeit für gewähltes Datum …'}
                    {!checkingAvailability && liveAvailability?.available && (
                      <span>
                        ✓ Wohnung ist im gewählten Zeitraum frei (Einzug{' '}
                        {formatDate(startDate)}
                        {endDate ? `, Auszug ${formatDate(endDate)}` : ', unbefristet'}).
                      </span>
                    )}
                    {!checkingAvailability && liveAvailability && !liveAvailability.available && (
                      <div>
                        <p className="font-medium">
                          Konflikt im neuen Zeitraum ({liveAvailability.conflicts.length}):
                        </p>
                        <ul className="mt-1 list-inside list-disc">
                          {liveAvailability.conflicts.map((c) => (
                            <li key={c.id}>
                              {c.label} – {formatDate(c.start_date)} bis {formatDate(c.end_date)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    onClick={handleCommit}
                    disabled={
                      pending ||
                      !startDate ||
                      !preview.matchedApartmentId ||
                      checkingAvailability ||
                      (liveAvailability !== null && !liveAvailability.available)
                    }
                  >
                    {pending ? 'Speichere …' : 'Mieter & Buchung anlegen'}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {!preview.matchedApartmentId && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Wir konnten die Wohnung in eurem Bestand nicht zuordnen. Prüfe, ob die Referenz
              im PDF (<strong>{preview.apartmentNumberFound ?? '–'}</strong>) zu einer Wohnung in
              der App passt. Du kannst das PDF zur Sicherheit speichern und die Buchung manuell
              über „Neue Buchung" anlegen.
            </div>
          )}
        </>
      )}
    </div>
  );
}
