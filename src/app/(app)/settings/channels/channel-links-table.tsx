'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { saveChannelLink, triggerFullSync } from '@/server/channels/sync';

interface Apartment {
  id: string;
  number: string;
  building: string;
  type: string;
  allowed_rental_types: string[];
}
interface Channel {
  id: string;
  code: string;
  display_name: string;
}
interface Link {
  apartment_id: string;
  channel_id: string;
  ical_pull_url: string | null;
  external_id: string | null;
}

interface Props {
  apartments: Apartment[];
  channels: Channel[];
  links: Link[];
}

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function ChannelLinksTable({ apartments, channels, links }: Props) {
  const [filter, setFilter] = useState('');
  const [onlyAllowed, setOnlyAllowed] = useState(true);
  const [pending, startTransition] = useTransition();
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [editing, setEditing] = useState<Map<string, string>>(new Map());

  function key(aptId: string, chId: string) {
    return `${aptId}:${chId}`;
  }
  function getCurrent(aptId: string, chId: string): string {
    const k = key(aptId, chId);
    if (editing.has(k)) return editing.get(k) ?? '';
    return links.find((l) => l.apartment_id === aptId && l.channel_id === chId)?.ical_pull_url ?? '';
  }
  function setLocal(aptId: string, chId: string, value: string) {
    const next = new Map(editing);
    next.set(key(aptId, chId), value);
    setEditing(next);
  }

  function save(aptId: string, channelCode: string, channelId: string) {
    const url = getCurrent(aptId, channelId);
    const fd = new FormData();
    fd.append('apartment_id', aptId);
    fd.append('channel_code', channelCode);
    fd.append('ical_pull_url', url);
    startTransition(async () => {
      const r = await saveChannelLink(fd);
      if (!r.ok) alert(r.error ?? 'Fehler');
      else setEditing((prev) => {
        const next = new Map(prev);
        next.delete(key(aptId, channelId));
        return next;
      });
    });
  }

  function syncAll() {
    setSyncResult(null);
    startTransition(async () => {
      const r = await triggerFullSync();
      if (!r.ok) {
        setSyncResult(`Fehler: ${r.error}`);
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
      setSyncResult(
        `Sync für ${r.results.length} Verknüpfung(en) abgeschlossen: ${tot.inserted} neu, ${tot.updated} aktualisiert, ${tot.cancelled} storniert, ${tot.errors} Fehler.`,
      );
    });
  }

  const filtered = apartments
    .filter((a) => !filter || a.number.toLowerCase().includes(filter.toLowerCase()))
    .filter((a) => !onlyAllowed || a.allowed_rental_types.includes('booking'));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Wohnung suchen…"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyAllowed}
            onChange={(e) => setOnlyAllowed(e.target.checked)}
          />
          Nur Wohnungen mit Booking-Vermietung
        </label>
        <Button onClick={syncAll} disabled={pending} className="ml-auto">
          {pending ? 'Synchronisiere …' : 'Jetzt alle Channels syncen'}
        </Button>
      </div>

      {syncResult && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {syncResult}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Wohnung</th>
              <th className="px-3 py-2">Typ</th>
              {channels.map((c) => (
                <th key={c.id} className="px-3 py-2">
                  {c.display_name} – iCal-URL
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/60">
                <td className="whitespace-nowrap px-3 py-2 font-medium">{a.number}</td>
                <td className="whitespace-nowrap px-3 py-2 capitalize">{a.type}</td>
                {channels.map((c) => {
                  const value = getCurrent(a.id, c.id);
                  const linked = links.find((l) => l.apartment_id === a.id && l.channel_id === c.id);
                  const isDirty = editing.has(key(a.id, c.id));
                  return (
                    <td key={c.id} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          value={value}
                          onChange={(e) => setLocal(a.id, c.id, e.target.value)}
                          placeholder="https://…"
                          className={inputCls}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => save(a.id, c.code, c.id)}
                          disabled={pending || !isDirty}
                        >
                          Speichern
                        </Button>
                      </div>
                      {linked?.ical_pull_url && !isDirty && (
                        <Badge tone="success" className="mt-1">
                          aktiv
                        </Badge>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Push-Feed (für Booking.com / Airbnb)</p>
        <p className="mt-1">
          Damit Booking.com auch unsere Belegung kennt, kannst du dort die folgende URL als „importierten
          Kalender" eintragen (pro Wohnung):
        </p>
        <code className="mt-2 block whitespace-pre rounded bg-white px-3 py-2 font-mono text-[11px] text-slate-700">
          {typeof window !== 'undefined' ? window.location.origin : 'https://tp-command-domain'}/api/ical/&lt;APARTMENT_ID&gt;
        </code>
      </div>
    </div>
  );
}
