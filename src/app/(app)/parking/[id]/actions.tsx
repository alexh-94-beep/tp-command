'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  createBookingParkingAssignment,
  setParkingBookingPool,
  updateParkingSpotNotes,
} from '@/server/parking/actions';

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

interface Props {
  spot: {
    id: string;
    number: number;
    is_booking_pool: boolean;
    notes_internal: string | null;
  };
}

export default function ParkingSpotActions({ spot }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(spot.notes_internal ?? '');
  const [showBooking, setShowBooking] = useState(false);
  const [tenant, setTenant] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');

  function togglePool() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('spot_id', spot.id);
      fd.set('is_booking_pool', spot.is_booking_pool ? '0' : '1');
      const r = await setParkingBookingPool(fd);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  function saveNotes() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('spot_id', spot.id);
      fd.set('notes_internal', notes);
      const r = await updateParkingSpotNotes(fd);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  function createBooking() {
    setError(null);
    if (!tenant || !startDate || !endDate) {
      setError('Bitte Gast, Einzug, Auszug ausfüllen.');
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set('spot_id', spot.id);
      fd.set('tenant_label', tenant);
      fd.set('start_date', startDate);
      fd.set('end_date', endDate);
      if (bookingNotes) fd.set('notes', bookingNotes);
      const r = await createBookingParkingAssignment(fd);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      setShowBooking(false);
      setTenant('');
      setStartDate('');
      setEndDate('');
      setBookingNotes('');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktionen</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4 text-sm">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
          <div>
            <div className="font-medium">Für Booking-Gäste freigeben</div>
            <div className="text-xs text-slate-500">
              Wenn aktiv, erscheint der PP in der Auswahl beim Booking-Workflow.
            </div>
          </div>
          <Button
            variant={spot.is_booking_pool ? 'secondary' : 'primary'}
            onClick={togglePool}
            disabled={pending}
          >
            {spot.is_booking_pool ? 'Aus Pool entfernen' : 'In Booking-Pool aufnehmen'}
          </Button>
        </div>

        <div>
          <label className="block text-xs text-slate-500">
            Interne Notiz (wird vom Re-Import nicht überschrieben)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputCls} mt-1 text-xs`}
            placeholder="z.B. Defekter Schließzylinder, hinter Säule, ..."
          />
          <div className="mt-1 flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={saveNotes}
              disabled={pending}
            >
              Notiz speichern
            </Button>
          </div>
        </div>

        <div className="border-t pt-3">
          {!showBooking ? (
            <Button
              variant="secondary"
              onClick={() => setShowBooking(true)}
              disabled={pending}
            >
              <Plus className="h-4 w-4" />
              Booking-Belegung erfassen
            </Button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500">
                  Gast / Bezeichnung
                </label>
                <input
                  className={`${inputCls} mt-1`}
                  value={tenant}
                  onChange={(e) => setTenant(e.target.value)}
                  placeholder="z.B. Anna Müller (Booking 5269073028)"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500">Von</label>
                  <input
                    type="date"
                    className={`${inputCls} mt-1`}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">Bis</label>
                  <input
                    type="date"
                    className={`${inputCls} mt-1`}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500">Notiz</label>
                <input
                  className={`${inputCls} mt-1 text-xs`}
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowBooking(false)}
                  disabled={pending}
                >
                  Abbrechen
                </Button>
                <Button onClick={createBooking} disabled={pending}>
                  {pending ? 'Speichere…' : 'Belegung anlegen'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
