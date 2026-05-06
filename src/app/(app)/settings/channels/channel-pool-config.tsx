'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { saveChannelConfig, triggerSingleChannelPoolSync } from '@/server/channels/pool';

interface Channel {
  id: string;
  code: string;
  display_name: string;
  config: Record<string, unknown> | null;
}

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function ChannelPoolConfig({ channels }: { channels: Channel[] }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Map<string, string>>(new Map());
  const [message, setMessage] = useState<string | null>(null);

  function getCurrent(c: Channel): string {
    if (editing.has(c.id)) return editing.get(c.id) ?? '';
    return ((c.config as { pool_ical_url?: string } | null)?.pool_ical_url) ?? '';
  }

  function save(c: Channel) {
    const url = getCurrent(c);
    const fd = new FormData();
    fd.append('channel_id', c.id);
    fd.append('pool_ical_url', url);
    startTransition(async () => {
      const r = await saveChannelConfig(fd);
      if (!r.ok) setMessage(`Fehler: ${r.error}`);
      else {
        setMessage(`${c.display_name}: gespeichert`);
        setEditing((prev) => {
          const next = new Map(prev);
          next.delete(c.id);
          return next;
        });
      }
    });
  }

  function syncOne(c: Channel) {
    setMessage(null);
    startTransition(async () => {
      const r = await triggerSingleChannelPoolSync(c.id);
      if (!r.ok || !r.result) {
        setMessage(`Sync fehlgeschlagen: ${r.error ?? 'kein Ergebnis'}`);
        return;
      }
      const x = r.result;
      setMessage(
        `${c.display_name}: ${x.fetched} geladen, ${x.inserted} neu, ${x.updated} aktualisiert, ${x.cancelled} storniert, ${x.errors.length} Fehler.`,
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pool-Modus (eine iCal-URL pro Channel)</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-xs text-slate-500">
          Für Inserate, die nicht auf eine konkrete Wohnung mappen (z. B. ein generisches
          Booking.com-Inserat). Reservationen kommen ohne Wohnungs-Zuordnung rein und müssen
          unter „Buchungen → Offene Pool-Reservationen" einer Wohnung zugewiesen werden.
        </p>
        <div className="space-y-2">
          {channels.map((c) => {
            const value = getCurrent(c);
            const isDirty = editing.has(c.id);
            const hasUrl = Boolean(((c.config as { pool_ical_url?: string } | null)?.pool_ical_url));
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2">
                <div className="w-32 text-sm font-medium">{c.display_name}</div>
                <input
                  type="url"
                  value={value}
                  onChange={(e) => {
                    const next = new Map(editing);
                    next.set(c.id, e.target.value);
                    setEditing(next);
                  }}
                  placeholder="https://… (iCal-Export aus dem Channel)"
                  className={`${inputCls} flex-1`}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => save(c)}
                  disabled={pending || !isDirty}
                >
                  Speichern
                </Button>
                <Button
                  size="sm"
                  onClick={() => syncOne(c)}
                  disabled={pending || !hasUrl || isDirty}
                >
                  Pool syncen
                </Button>
                {hasUrl && !isDirty && <Badge tone="success">aktiv</Badge>}
              </div>
            );
          })}
        </div>

        {message && (
          <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-700">{message}</div>
        )}
      </CardBody>
    </Card>
  );
}
