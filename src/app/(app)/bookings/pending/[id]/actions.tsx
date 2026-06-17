'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X, Ban, UserPlus } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  cancelPendingReservation,
  updatePendingReservation,
} from '@/server/channels/pending';
import { AssignDialog } from '../assign-dialog';

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

interface Props {
  reservation: {
    id: string;
    start_date: string;
    end_date: string;
    summary: string | null;
    description: string | null;
    guest_count: number | null;
    status: string;
  };
}

export default function PendingDetailActions({ reservation }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = reservation.status === 'pending';

  function handleEdit(form: FormData) {
    setError(null);
    form.set('reservation_id', reservation.id);
    startTransition(async () => {
      const r = await updatePendingReservation(form);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function handleCancel() {
    if (!confirm('Pool-Reservation wirklich stornieren?')) return;
    setError(null);
    startTransition(async () => {
      const r = await cancelPendingReservation(reservation.id);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      router.push('/bookings/pending');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktionen</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!editing && isOpen && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAssignOpen(true)} disabled={pending}>
              <UserPlus className="h-4 w-4" />
              Wohnung zuweisen
            </Button>
            <Button
              variant="secondary"
              onClick={() => setEditing(true)}
              disabled={pending}
            >
              <Pencil className="h-4 w-4" />
              Bearbeiten
            </Button>
            <Button variant="secondary" onClick={handleCancel} disabled={pending}>
              <Ban className="h-4 w-4" />
              Stornieren
            </Button>
          </div>
        )}

        {!isOpen && (
          <p className="text-sm text-slate-500">
            Diese Reservation ist {reservation.status === 'assigned' ? 'bereits zugewiesen' : 'storniert'} —
            keine Aktionen mehr möglich.
          </p>
        )}

        {editing && (
          <form action={handleEdit} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500">
                Gast-Name (z.B. &bdquo;Max Mustermann&ldquo;)
              </label>
              <input
                name="summary"
                defaultValue={reservation.summary ?? ''}
                placeholder="Vorname Nachname"
                className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-500">
                Wird in der Liste als Gast-Name angezeigt.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500">Einzug</label>
                <input
                  type="date"
                  name="start_date"
                  defaultValue={reservation.start_date}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500">Auszug</label>
                <input
                  type="date"
                  name="end_date"
                  defaultValue={reservation.end_date}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500">Personen</label>
              <input
                type="number"
                name="guest_count"
                min={1}
                defaultValue={reservation.guest_count ?? ''}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500">
                Notizen / Link
              </label>
              <textarea
                name="description"
                rows={4}
                defaultValue={reservation.description ?? ''}
                className={`${inputCls} font-mono text-xs`}
                placeholder="Booking-Link, Kontakt, Sonderwünsche..."
              />
              <p className="mt-1 text-xs text-slate-500">
                Wird in die Notizen der späteren Buchung übernommen.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                <X className="h-4 w-4" />
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Speichere…' : 'Änderungen speichern'}
              </Button>
            </div>
          </form>
        )}

        {assignOpen && (
          <AssignDialog
            reservationId={reservation.id}
            guestName={reservation.summary ?? ''}
            onClose={() => setAssignOpen(false)}
            onAssigned={(bookingId) => {
              setAssignOpen(false);
              router.push(`/bookings/${bookingId}` as never);
            }}
          />
        )}
      </CardBody>
    </Card>
  );
}
