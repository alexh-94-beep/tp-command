'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { triggerPoolSync } from '@/server/channels/pool';
import { formatDate } from '@/lib/dates';
import { AssignDialog } from './assign-dialog';

interface Row {
  id: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  status: string;
  channel_code: string;
  channel_label: string;
}

export default function PendingReservationsList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [dialogReservationId, setDialogReservationId] = useState<string | null>(null);

  function syncAll() {
    setSyncMessage(null);
    startTransition(async () => {
      const r = await triggerPoolSync();
      if (!r.ok) {
        setSyncMessage(`Fehler: ${r.error}`);
        return;
      }
      const tot = r.results.reduce(
        (a, x) => ({
          inserted: a.inserted + x.inserted,
          updated: a.updated + x.updated,
          cancelled: a.cancelled + x.cancelled,
          errors: a.errors + x.errors.length,
        }),
        { inserted: 0, updated: 0, cancelled: 0, errors: 0 },
      );
      setSyncMessage(
        `Sync: ${tot.inserted} neu, ${tot.updated} aktualisiert, ${tot.cancelled} storniert, ${tot.errors} Fehler.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button onClick={syncAll} disabled={pending}>
          {pending ? 'Synchronisiere …' : 'Pool jetzt syncen'}
        </Button>
        <span className="text-xs text-slate-500">
          {rows.length} offene Reservation(en)
        </span>
      </div>

      {syncMessage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {syncMessage}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Keine offenen Reservationen. Drück „Pool jetzt syncen", falls du gerade neue Buchungen
          auf Booking.com erwartest.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Einzug</th>
                <th className="px-4 py-3">Auszug</th>
                <th className="px-4 py-3">Notiz</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge tone="info">{r.channel_label}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(r.start_date)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(r.end_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.summary ?? '–'}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Button size="sm" onClick={() => setDialogReservationId(r.id)}>
                      Wohnung zuweisen
                    </Button>
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
