'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { createBooking, type CreateBookingResult } from '@/server/bookings/create';
import { listApartmentsForBooking } from '@/server/bookings/find-available';
import { rentalTypeLabel } from '@/lib/labels';
import { formatDate } from '@/lib/dates';
import type { ApartmentAvailability } from '@/services/availability/find';
import type { RentalType } from '@/types/aliases';

const RENTAL_TYPES: RentalType[] = ['long_term', 'short_term', 'booking'];

interface ChannelOpt {
  id: string;
  code: string;
  display_name: string;
}

const labelCls = 'block text-sm font-medium text-slate-700';
const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function NewBookingForm({
  channels,
  defaultApartmentId,
  rentalType: initialRentalType,
}: {
  channels: ChannelOpt[];
  defaultApartmentId?: string;
  /** Phase 25a: vom Typ-Wahl-Schritt vorgegeben, im Formular nur als read-only Anzeige */
  rentalType: RentalType;
}) {
  const [apartmentId, setApartmentId] = useState(defaultApartmentId ?? '');
  const rentalType = initialRentalType;
  const [invoicedVia, setInvoicedVia] = useState<'w_w' | 'direct'>('w_w');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [apartments, setApartments] = useState<ApartmentAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<CreateBookingResult | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedApartment = useMemo(
    () => apartments.find((a) => a.id === apartmentId),
    [apartments, apartmentId],
  );

  useEffect(() => {
    if (!startDate) {
      return;
    }
    // Loading-Indikator erst beim tatsaechlichen Fetch setzen (nach 250ms
    // Debounce), nicht direkt im Effect-Body — react-hooks/set-state-in-effect.
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await listApartmentsForBooking({
          startDate,
          endDate: endDate || undefined,
        });
        setApartments(r);
        if (apartmentId) {
          const stillAvailable = r.find((a) => a.id === apartmentId)?.available;
          if (!stillAvailable) setApartmentId('');
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  // "Wohnungen leeren wenn Datum entfernt" als abgeleiteter Zustand statt
  // im Effect.
  const [prevStart, setPrevStart] = useState(startDate);
  if (prevStart !== startDate) {
    setPrevStart(startDate);
    if (!startDate && apartments.length > 0) {
      setApartments([]);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitResult(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const r = await createBooking(fd);
      if (r && !r.ok) setSubmitResult(r);
    });
  }

  const fe = submitResult?.fieldErrors ?? {};
  const isLongTerm = !endDate;
  const availableCount = apartments.filter((a) => a.available).length;
  const allowedTypes = selectedApartment?.allowed_rental_types ?? RENTAL_TYPES;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {submitResult?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">{submitResult.error}</p>
          {submitResult.conflicts && submitResult.conflicts.length > 0 && (
            <ul className="mt-2 list-inside list-disc">
              {submitResult.conflicts.map((c) => (
                <li key={c.id}>
                  {c.label} – {formatDate(c.start_date)} bis {formatDate(c.end_date)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Zeitraum &amp; Wohnung</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Einzug *</label>
                <DateInput
                  name="start_date"
                  value={startDate}
                  onChange={setStartDate}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Auszug <span className="text-slate-400">(leer = Langzeit, unbefristet)</span>
                </label>
                <DateInput name="end_date" value={endDate} onChange={setEndDate} className="mt-1" />
              </div>
            </div>

            <div>
              <label className={labelCls}>
                Wohnung *
                {startDate && !loading && apartments.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {availableCount} von {apartments.length} verfügbar
                    {isLongTerm ? ' für Langzeit' : ' im Zeitraum'}
                  </span>
                )}
              </label>
              <select
                className={inputCls}
                name="apartment_id"
                value={apartmentId}
                onChange={(e) => setApartmentId(e.target.value)}
                required
                disabled={!startDate || loading}
              >
                <option value="">
                  {!startDate
                    ? '– zuerst Einzug eingeben –'
                    : loading
                      ? 'Lade Wohnungen …'
                      : '– wählen –'}
                </option>
                {apartments.map((a) => (
                  <option key={a.id} value={a.id} disabled={!a.available}>
                    {a.number} · {a.building} · {a.type}
                    {a.available
                      ? ''
                      : a.free_until
                        ? `  —  belegt ab ${a.free_until}`
                        : `  —  ${a.reason ?? 'belegt'}`}
                  </option>
                ))}
              </select>
              {selectedApartment && !selectedApartment.available && (
                <p className="mt-1 text-xs text-red-600">
                  {selectedApartment.reason ?? 'Wohnung ist nicht verfügbar.'}
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mieter / Gast</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className={labelCls}>Art</label>
              <select className={inputCls} name="tenant_kind" defaultValue="tenant">
                <option value="tenant">Mieter (Lang-/Kurzzeit)</option>
                <option value="guest">Gast (Booking &amp; Co.)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Vorname</label>
                <input className={inputCls} name="first_name" required />
                {fe.first_name && (
                  <p className="mt-1 text-xs text-red-600">{fe.first_name[0]}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Nachname</label>
                <input className={inputCls} name="last_name" required />
                {fe.last_name && <p className="mt-1 text-xs text-red-600">{fe.last_name[0]}</p>}
              </div>
              <div>
                <label className={labelCls}>E-Mail</label>
                <input type="email" className={inputCls} name="email" />
                {fe.email && <p className="mt-1 text-xs text-red-600">{fe.email[0]}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  Wenn die E-Mail bereits existiert, nutzen wir den bestehenden Mieter.
                </p>
              </div>
              <div>
                <label className={labelCls}>Telefon</label>
                <input className={inputCls} name="phone" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Quelle</label>
                <select className={inputCls} name="source" defaultValue="direct">
                  <option value="direct">Direkt</option>
                  <option value="flatfox">Flatfox</option>
                  <option value="booking_com">Booking.com</option>
                  <option value="airbnb">Airbnb</option>
                  <option value="expedia">Expedia</option>
                  <option value="website">Website</option>
                </select>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Konditionen</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <input type="hidden" name="rental_type" value={rentalType} />
            {selectedApartment && !allowedTypes.includes(rentalType) && (
              <p className="text-xs text-amber-700">
                Diese Wohnung ist für &bdquo;{rentalTypeLabel[rentalType]}&ldquo;
                nicht voreingestellt. Buchung trotzdem möglich.
              </p>
            )}

            {rentalType === 'short_term' && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className={labelCls}>Abrechnung</div>
                <div className="mt-2 flex gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="invoiced_via"
                      value="w_w"
                      checked={invoicedVia === 'w_w'}
                      onChange={() => setInvoicedVia('w_w')}
                    />
                    Via W&amp;W
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="invoiced_via"
                      value="direct"
                      checked={invoicedVia === 'direct'}
                      onChange={() => setInvoicedVia('direct')}
                    />
                    Direkt mit Offerte (ohne Vertrag)
                  </label>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Bei &bdquo;Direkt&ldquo; werden Mietzins und Depot Pflichtfelder.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <div>
                <label className={labelCls}>
                  Mietzins (CHF){' '}
                  {selectedApartment && (
                    <span className="text-xs font-normal text-slate-500">
                      Standard:{' '}
                      {rentalType === 'short_term'
                        ? (selectedApartment.short_term_flat_rate ?? '–')
                        : selectedApartment.standard_rent}
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  name="rent_amount"
                  required={
                    rentalType === 'long_term' ||
                    (rentalType === 'short_term' && invoicedVia === 'direct')
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Depot (CHF)</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  name="deposit_amount"
                  required={
                    rentalType === 'long_term' ||
                    (rentalType === 'short_term' && invoicedVia === 'direct')
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Channel</label>
                <select className={inputCls} name="channel_id" defaultValue="">
                  <option value="">– keiner –</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
              </div>
              {rentalType === 'short_term' && (
                <div>
                  <label className={labelCls}>Kurzzeitpauschale</label>
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls}
                    name="short_term_flat_rate"
                  />
                </div>
              )}
              <div className="flex items-end gap-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="parking_included" />
                  Parkplatz inkl.
                </label>
              </div>
              <div>
                <label className={labelCls}>Parking-Gebühr (CHF/Mt)</label>
                <input type="number" step="0.01" className={inputCls} name="parking_fee" />
              </div>
              {rentalType !== 'long_term' && (
                <div>
                  <label className={labelCls}>Externe Referenz</label>
                  <input
                    className={inputCls}
                    name="external_reference"
                    placeholder="z. B. Booking-Nr."
                  />
                </div>
              )}
            </div>

            {rentalType === 'long_term' && (
              <div>
                <label className={labelCls}>Vertragsstatus</label>
                <select className={inputCls} name="contract_status" defaultValue="draft">
                  <option value="draft">Entwurf</option>
                  <option value="sent">Versendet</option>
                  <option value="signed">Unterschrieben</option>
                  <option value="cancelled">Abgesagt</option>
                </select>
              </div>
            )}
            {rentalType !== 'long_term' && (
              <input type="hidden" name="contract_status" value="signed" />
            )}
            <input type="hidden" name="status" value="planned" />

            <div>
              <label className={labelCls}>Notizen</label>
              <textarea className={`${inputCls} min-h-[80px]`} name="notes" />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending || !apartmentId || !startDate}>
          {pending ? 'Speichere …' : 'Buchung anlegen'}
        </Button>
      </div>
    </form>
  );
}
