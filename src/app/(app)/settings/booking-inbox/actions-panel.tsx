'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plug, RefreshCw } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  runBookingInboxPoll,
  testBookingInboxConnection,
} from '@/server/channels/booking-inbox';

export default function BookingInboxActions() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [test, setTest] = useState<{
    ok: boolean;
    error?: string;
    recentBookingCount?: number;
    hostInfo?: string;
  } | null>(null);
  const [poll, setPoll] = useState<{
    ok: boolean;
    error?: string;
    fetched?: number;
    newReservations?: number;
    cancellations?: number;
    guestMessages?: number;
    skipped?: number;
    errors?: string[];
  } | null>(null);

  function handleTest() {
    setTest(null);
    startTransition(async () => {
      const r = await testBookingInboxConnection();
      setTest(r);
    });
  }

  function handlePoll() {
    setPoll(null);
    startTransition(async () => {
      const r = await runBookingInboxPoll();
      setPoll(r);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verbindung &amp; manueller Pull</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleTest} disabled={pending}>
            <Plug className="h-4 w-4" />
            Verbindung testen
          </Button>
          <Button onClick={handlePoll} disabled={pending}>
            <RefreshCw className="h-4 w-4" />
            Jetzt pullen
          </Button>
        </div>

        {test && (
          <div
            className={`rounded-md border p-3 text-sm ${
              test.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {test.ok ? (
              <>
                ✓ Verbunden mit <strong>{test.hostInfo}</strong>.{' '}
                <strong>{test.recentBookingCount}</strong> Booking.com-Mails in
                den letzten 7 Tagen.
              </>
            ) : (
              <>Fehler: {test.error}</>
            )}
          </div>
        )}

        {poll && (
          <div
            className={`rounded-md border p-3 text-sm ${
              poll.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {poll.ok ? (
              <>
                Geholt: <strong>{poll.fetched}</strong> ·{' '}
                Neu: <strong>{poll.newReservations}</strong> ·{' '}
                Storno: <strong>{poll.cancellations}</strong> ·{' '}
                Gast-Nachricht: <strong>{poll.guestMessages ?? 0}</strong> ·{' '}
                Ignoriert: <strong>{poll.skipped}</strong>
                {poll.errors && poll.errors.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
                    {poll.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>Fehler: {poll.error}</>
            )}
          </div>
        )}

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="font-medium text-slate-800">ENV-Vars (Vercel):</div>
          <ul className="mt-1 list-disc pl-5">
            <li>
              <code>BOOKING_IMAP_HOST</code> — z.B. <code>imap.cyon.ch</code>
            </li>
            <li>
              <code>BOOKING_IMAP_PORT</code> — 993 (SSL) oder 143
              (STARTTLS); Default 993
            </li>
            <li>
              <code>BOOKING_IMAP_USER</code> — <code>info@tp-apartments.ch</code>
            </li>
            <li>
              <code>BOOKING_IMAP_PASSWORD</code> — App-Passwort (empfohlen)
            </li>
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
