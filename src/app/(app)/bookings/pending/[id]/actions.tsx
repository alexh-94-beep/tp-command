'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X, Ban, UserPlus, AlertTriangle, ExternalLink } from 'lucide-react';
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
    /** Phase 22h: Daten im Booking-Extranet verifiziert. False = Bestaetigungs-Mail enthielt keine Daten. */
    dates_verified: boolean;
    booking_detail_url: string | null;
  };
}

export default function PendingDetailActions({ reservation }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyChecked, setVerifyChecked] = useState(false);
  const [endDateInput, setEndDateInput] = useState(reservation.end_date);

  const isOpen = reservation.status === 'pending';
  const needsVerify = !reservation.dates_verified;
  const endDateChanged = endDateInput !== reservation.end_date;
  // Save erlaubt, sobald Mireme entweder das Auszugs-Datum geaendert hat
  // oder die "geprueft"-Checkbox angehakt ist.
  const canSaveEdit = !needsVerify || verifyChecked || endDateChanged;

  function handleEdit(form: FormData) {
    setError(null);
    form.set('reservation_id', reservation.id);
    // Phase 22h: explizit als verifiziert markieren, sobald Mireme entweder
    // den Auszug aendert oder die Checkbox haekelt.
    if (needsVerify && (endDateChanged || verifyChecked)) {
      form.set('dates_verified', '1');
    }
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

        {isOpen && needsVerify && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <div className="font-medium">
                  Datum aus Booking-Bestätigung nicht enthalten
                </div>
                <div className="text-xs">
                  Bitte im Booking-Extranet das Check-out-Datum prüfen und
                  hier eintragen, bevor du die Reservation einer Wohnung
                  zuweist.
                </div>
                {reservation.booking_detail_url && (
                  <a
                    href={reservation.booking_detail_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 underline hover:text-amber-700"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Im Booking-Extranet öffnen
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {!editing && isOpen && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setAssignOpen(true)}
              disabled={pending || needsVerify}
              title={
                needsVerify
                  ? 'Zuerst Daten im Booking-Extranet prüfen und Check-out bestätigen.'
                  : undefined
              }
            >
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
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {needsVerify && (
              <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={verifyChecked}
                  onChange={(e) => setVerifyChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  Ich habe das Auszugs-Datum im Booking-Extranet geprüft und
                  hier korrekt eingetragen.
                </span>
              </label>
            )}

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
              <Button type="submit" disabled={pending || !canSaveEdit}>
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
