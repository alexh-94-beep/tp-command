'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import {
  createPendingReservation,
  type CreatePendingResult,
} from '@/server/channels/pending';

const labelCls = 'block text-sm font-medium text-slate-700';
const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function NewPendingForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreatePendingResult | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const r = await createPendingReservation(fd);
      if (r.ok) {
        router.push('/bookings/pending');
      } else {
        setResult(r);
      }
    });
  }

  const fe = result?.fieldErrors ?? {};

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {result && !result.ok && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {result.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Eingegangene Reservation</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Channel *</label>
              <select className={inputCls} name="channel_code" defaultValue="booking_com" required>
                <option value="booking_com">Booking.com</option>
                <option value="airbnb">Airbnb</option>
                <option value="expedia">Expedia</option>
                <option value="website">Eigene Website</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Buchungs-Nr (Confirmation) *</label>
              <input
                className={inputCls}
                name="external_uid"
                required
                placeholder="z.B. 4321567890"
              />
              {fe.external_uid && (
                <p className="mt-1 text-xs text-red-600">{fe.external_uid[0]}</p>
              )}
            </div>
          </div>

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
              {fe.start_date && (
                <p className="mt-1 text-xs text-red-600">{fe.start_date[0]}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Auszug *</label>
              <DateInput
                name="end_date"
                value={endDate}
                onChange={setEndDate}
                required
                className="mt-1"
              />
              {fe.end_date && <p className="mt-1 text-xs text-red-600">{fe.end_date[0]}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Gast-Name (kurz)</label>
              <input
                className={inputCls}
                name="summary"
                placeholder="z.B. Anna Müller"
              />
              <p className="mt-1 text-xs text-slate-500">
                Wird in der Pending-Liste angezeigt. Voller Tenant-Datensatz wird beim Zuweisen
                angelegt.
              </p>
            </div>
            <div>
              <label className={labelCls}>Personen</label>
              <input
                type="number"
                min="1"
                className={inputCls}
                name="guest_count"
                placeholder="2"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Notizen / Wünsche aus der Buchung</label>
            <textarea
              className={`${inputCls} min-h-[80px]`}
              name="description"
              placeholder={'z.B. Späte Ankunft 23:00, Parkplatz gewünscht, …'}
            />
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push('/bookings/pending')}
        >
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending || !startDate || !endDate}>
          {pending ? 'Speichere …' : 'Pool-Reservation anlegen'}
        </Button>
      </div>
    </form>
  );
}
