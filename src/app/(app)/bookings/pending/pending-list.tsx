'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cancelPendingReservation } from '@/server/channels/pending';
import { formatDate } from '@/lib/dates';
import { AssignDialog } from './assign-dialog';

interface Row {
  id: string;
  external_uid: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  guest_count: number | null;
  channel_code: string;
  channel_label: string;
}

export default function PendingReservationsList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogReservationId, setDialogReservationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleCancel(id: string) {
    if (!confirm('Pool-Reservation wirklich stornieren?')) return;
    setError(null);
    startTransition(async () => {
      const r = await cancelPendingReservation(id);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{rows.length} offene Reservation(en)</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Keine offenen Reservationen. Lege eine neue Pool-Reservation an, sobald eine
          Booking-Mail eingeht.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Buchungs-Nr</th>
                <th className="px-4 py-3">Einzug</th>
                <th className="px-4 py-3">Auszug</th>
                <th className="px-4 py-3">Gast</th>
                <th className="px-4 py-3">Pers.</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge tone="info">{r.channel_label}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                    <Link
                      href={`/bookings/pending/${r.id}` as never}
                      className="hover:underline"
                    >
                      {r.external_uid}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.start_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.end_date)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <Link
                      href={`/bookings/pending/${r.id}` as never}
                      className="hover:underline"
                    >
                      {r.summary ?? (
                        <span className="text-slate-400 italic">
                          öffnen + Name ergänzen
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">
                    {r.guest_count ?? '–'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex justify-end gap-2">
                      <Link href={`/bookings/pending/${r.id}` as never}>
                        <Button size="sm" variant="secondary">
                          Öffnen
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCancel(r.id)}
                        disabled={pending}
                      >
                        Stornieren
                      </Button>
                      <Button size="sm" onClick={() => setDialogReservationId(r.id)}>
                        Wohnung zuweisen
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialogReservationId && (
        <AssignDialog
          reservationId={dialogReservationId}
          guestName={rows.find((r) => r.id === dialogReservationId)?.summary ?? ''}
          onClose={() => setDialogReservationId(null)}
          onAssigned={(bookingId) => {
            setDialogReservationId(null);
            router.push(`/bookings/${bookingId}`);
          }}
        />
      )}
    </div>
  );
}
