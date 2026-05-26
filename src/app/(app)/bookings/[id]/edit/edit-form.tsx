'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { updateBooking, cancelBooking, type UpdateBookingResult } from '@/server/bookings/update';
import { formatDate, OPEN_END_DATE } from '@/lib/dates';
import { rentalTypeLabel } from '@/lib/labels';
import type {
  BookingStatus,
  CheckInOutStatus,
  ContractStatus,
  RentalType,
} from '@/types/aliases';

const labelCls = 'block text-sm font-medium text-slate-700';
const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

interface BookingFormState {
  id: string;
  rental_type: RentalType;
  start_date: string;
  end_date: string;
  rent_amount: number;
  deposit_amount: number;
  short_term_flat_rate: number | null;
  parking_included: boolean;
  parking_fee: number | null;
  contract_status: ContractStatus;
  status: BookingStatus;
  check_in_status: CheckInOutStatus;
  check_out_status: CheckInOutStatus;
  external_reference: string | null;
  notes: string | null;
}

export default function EditBookingForm({ booking }: { booking: BookingFormState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UpdateBookingResult | null>(null);
  const [startDate, setStartDate] = useState(booking.start_date);
  const [endDate, setEndDate] = useState(
    booking.end_date === OPEN_END_DATE ? '' : booking.end_date,
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const r = await updateBooking(fd);
      if (r && !r.ok) setResult(r);
    });
  }

  function handleCancel() {
    if (!confirm('Buchung wirklich stornieren? Status wird auf „Storniert" gesetzt.')) return;
    startTransition(async () => {
      const r = await cancelBooking(booking.id);
      if (r.ok) router.push(`/bookings/${booking.id}`);
      else alert(r.error ?? 'Fehler beim Stornieren');
    });
  }

  const fe = result?.fieldErrors ?? {};

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="id" value={booking.id} />

      {result?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">{result.error}</p>
          {result.conflicts && result.conflicts.length > 0 && (
            <ul className="mt-2 list-inside list-disc">
              {result.conflicts.map((c) => (
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
            <CardTitle>Zeitraum</CardTitle>
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
                  Auszug <span className="text-slate-400">(leer = unbefristet)</span>
                </label>
                <DateInput name="end_date" value={endDate} onChange={setEndDate} className="mt-1" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Buchungsstatus</label>
                <select className={inputCls} name="status" defaultValue={booking.status}>
                  <option value="planned">Geplant</option>
                  <option value="active">Aktiv</option>
                  <option value="completed">Abgeschlossen</option>
                  <option value="cancelled">Storniert</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Vertragsstatus</label>
                <select
                  className={inputCls}
                  name="contract_status"
                  defaultValue={booking.contract_status}
                >
                  <option value="draft">Entwurf</option>
                  <option value="sent">Versendet</option>
                  <option value="signed">Unterschrieben</option>
                  <option value="cancelled">Abgesagt</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Check-in</label>
                <select
                  className={inputCls}
                  name="check_in_status"
                  defaultValue={booking.check_in_status}
                >
                  <option value="pending">Offen</option>
                  <option value="completed">Erledigt</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Check-out</label>
                <select
                  className={inputCls}
                  name="check_out_status"
                  defaultValue={booking.check_out_status}
                >
                  <option value="pending">Offen</option>
                  <option value="completed">Erledigt</option>
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div>
                <label className={labelCls}>Mietart</label>
                <select
                  className={inputCls}
                  name="rental_type"
                  defaultValue={booking.rental_type}
                >
                  <option value="long_term">{rentalTypeLabel.long_term}</option>
                  <option value="short_term">{rentalTypeLabel.short_term}</option>
                  <option value="booking">{rentalTypeLabel.booking}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Mietzins (CHF)</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  name="rent_amount"
                  defaultValue={booking.rent_amount}
                  required
                />
                {fe.rent_amount && (
                  <p className="mt-1 text-xs text-red-600">{fe.rent_amount[0]}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Depot (CHF)</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  name="deposit_amount"
                  defaultValue={booking.deposit_amount}
                />
              </div>
              <div>
                <label className={labelCls}>Kurzzeitpauschale</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  name="short_term_flat_rate"
                  defaultValue={booking.short_term_flat_rate ?? ''}
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="parking_included"
                    defaultChecked={booking.parking_included}
                  />
                  Parkplatz inkl.
                </label>
              </div>
              <div>
                <label className={labelCls}>Parking-Gebühr (CHF/Mt)</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  name="parking_fee"
                  defaultValue={booking.parking_fee ?? ''}
                />
              </div>
              <div>
                <label className={labelCls}>Externe Referenz</label>
                <input
                  className={inputCls}
                  name="external_reference"
                  defaultValue={booking.external_reference ?? ''}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Notizen</label>
              <textarea
                className={`${inputCls} min-h-[100px]`}
                name="notes"
                defaultValue={booking.notes ?? ''}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="danger" onClick={handleCancel} disabled={pending}>
          Buchung stornieren
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`/bookings/${booking.id}`)}
          >
            Abbrechen
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Speichere …' : 'Änderungen speichern'}
          </Button>
        </div>
      </div>
    </form>
  );
}
