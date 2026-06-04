'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { assignReservation, getSuggestions } from '@/server/channels/pending';
import { formatDate } from '@/lib/dates';
import type {
  SuggestionsResult,
  ApartmentSuggestion,
} from '@/services/channels/auto-assign';

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export function AssignDialog({
  reservationId,
  guestName,
  onClose,
  onAssigned,
}: {
  reservationId: string;
  guestName?: string;
  onClose: () => void;
  onAssigned: (bookingId: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<SuggestionsResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rentAmount, setRentAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [name, setName] = useState(guestName ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // Suggestions laden (async IIFE, react-hooks/set-state-in-effect-konform)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getSuggestions(reservationId);
      if (cancelled) return;
      setData(r);
      const top = r?.suggestions.find((s) => s.available);
      if (top) setSelected(top.apartment_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [reservationId]);

  function submit() {
    if (!selected) return;
    setError(null);
    const fd = new FormData();
    fd.append('reservation_id', reservationId);
    fd.append('apartment_id', selected);
    fd.append('rent_amount', rentAmount || '0');
    fd.append('deposit_amount', depositAmount || '0');
    if (name.trim()) fd.append('guest_name', name.trim());
    startTransition(async () => {
      const r = await assignReservation(fd);
      if (!r.ok) {
        setError(r.error ?? 'Fehler beim Zuweisen');
        return;
      }
      // Non-fatal warning (Workflow/Reinigung konnten nicht angelegt werden)
      // → Buchung steht, wir zeigen die Warnung aber als Alert vor dem Redirect.
      if (r.warning) {
        alert(
          `Buchung wurde angelegt, aber: ${r.warning}\n\n` +
            'Bitte Workflow-Aufgaben bzw. Reinigung in der Detail-Ansicht nachziehen.',
        );
      }
      onAssigned(r.bookingId!);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold">Wohnung für Reservation zuweisen</h2>
          {data?.reservation && (
            <p className="mt-1 text-xs text-slate-500">
              {formatDate(data.reservation.start_date)} –{' '}
              {formatDate(data.reservation.end_date)}
              {data.reservation.summary ? ` · ${data.reservation.summary}` : ''}
            </p>
          )}
        </div>

        <div className="space-y-4 px-6 py-5">
          {pending && !data && <div className="text-sm text-slate-500">Lade Vorschläge …</div>}

          {data && data.suggestions.length === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Keine Wohnung mit Vermietungsart &bdquo;Booking&ldquo; konfiguriert. Aktiviere
              zuerst eine Wohnung über &bdquo;Wohnung bearbeiten&ldquo; → Vermietung.
            </div>
          )}

          {data && data.suggestions.length > 0 && (
            <>
              <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-3 py-2"></th>
                      <th className="px-3 py-2">Wohnung</th>
                      <th className="px-3 py-2">Typ</th>
                      <th className="px-3 py-2">Pool</th>
                      <th className="px-3 py-2">Prio</th>
                      <th className="px-3 py-2">Puffer</th>
                      <th className="px-3 py-2">Lücke vor</th>
                      <th className="px-3 py-2">Lücke nach</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.suggestions.map((s, i) => (
                      <SuggestionRow
                        key={s.apartment_id}
                        s={s}
                        rank={i}
                        selected={selected === s.apartment_id}
                        onSelect={() => s.available && setSelected(s.apartment_id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-slate-700">
                    Gast-Name (für Tenant-Datensatz)
                  </label>
                  <input
                    className={`${inputCls} mt-1`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="z.B. Anna Müller"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Optional. Leer = generischer Pool-Gast.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Mietzins (CHF)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className={`${inputCls} mt-1`}
                    value={rentAmount}
                    onChange={(e) => setRentAmount(e.target.value)}
                    placeholder="z.B. 600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Depot (CHF)</label>
                  <input
                    type="number"
                    step="0.01"
                    className={`${inputCls} mt-1`}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={pending || !selected}>
            {pending ? 'Speichere …' : 'Zuweisen & Buchung anlegen'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuggestionRow({
  s,
  rank,
  selected,
  onSelect,
}: {
  s: ApartmentSuggestion;
  rank: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const cls = selected
    ? 'bg-emerald-50/70 cursor-pointer'
    : s.available
      ? 'hover:bg-slate-50 cursor-pointer'
      : 'opacity-60 cursor-not-allowed';
  return (
    <tr className={cls} onClick={onSelect}>
      <td className="px-3 py-2">
        <input type="radio" checked={selected} onChange={onSelect} disabled={!s.available} />
      </td>
      <td className="px-3 py-2 font-medium whitespace-nowrap">{s.number}</td>
      <td className="px-3 py-2 capitalize whitespace-nowrap">{s.type}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        {s.is_pool_default && <Badge tone="info">Pool-Default</Badge>}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{s.booking_priority}</td>
      <td className="px-3 py-2 whitespace-nowrap text-slate-600">
        {s.cleaning_buffer_hours} h
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-slate-600">
        {s.gap_before_days === null ? '–' : `${s.gap_before_days} T`}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-slate-600">
        {s.gap_after_days === null ? '–' : `${s.gap_after_days} T`}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {s.available ? (
          rank === 0 ? (
            <Badge tone="success">Top-Vorschlag</Badge>
          ) : (
            <Badge tone="neutral">verfügbar</Badge>
          )
        ) : (
          <span className="text-xs text-red-700">{s.reason}</span>
        )}
      </td>
    </tr>
  );
}
