'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { bulkMarkPaid } from '@/server/payments/actions';
import { formatDate, todayIso } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import {
  paymentMethodLabel,
  paymentStatusLabel,
  paymentStatusTone,
  paymentTypeLabel,
} from '@/lib/labels';
import type {
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@/types/aliases';

export interface PaymentListRow {
  id: string;
  type: PaymentType;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: PaymentStatus;
  method: PaymentMethod;
  reference: string | null;
  booking_id: string | null;
  apartment_number: string | null;
  tenant_name: string;
}

export default function PaymentsList({ rows }: { rows: PaymentListRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableCount = rows.filter(
    (r) => r.status === 'pending' || r.status === 'overdue',
  ).length;

  function handleBulkMarkPaid() {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} Zahlung(en) als bezahlt markieren?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await bulkMarkPaid(Array.from(selectedIds));
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {selectedIds.size > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
          <span>
            <strong>{selectedIds.size}</strong> Zahlung(en) ausgewählt
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="ml-3 text-xs text-blue-700 hover:underline"
            >
              Auswahl löschen
            </button>
          </span>
          <Button size="sm" onClick={handleBulkMarkPaid} disabled={pending}>
            <CheckCircle2 className="h-4 w-4" />
            Als bezahlt markieren
          </Button>
        </div>
      ) : (
        selectableCount > 0 && (
          <div className="flex items-center text-xs text-slate-500">
            <button
              type="button"
              onClick={() =>
                setSelectedIds(
                  new Set(
                    rows
                      .filter((r) => r.status === 'pending' || r.status === 'overdue')
                      .map((r) => r.id),
                  ),
                )
              }
              className="hover:underline"
            >
              Alle offenen + überfälligen markieren ({selectableCount})
            </button>
          </div>
        )
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-3 w-8"></th>
              <th className="px-3 py-3">Fällig</th>
              <th className="px-3 py-3">Wohnung</th>
              <th className="px-3 py-3">Mieter / Gast</th>
              <th className="px-3 py-3">Typ</th>
              <th className="px-3 py-3 text-right">Betrag</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Methode</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const isOverdueCalc =
                (r.status === 'pending' || r.status === 'overdue') &&
                r.due_date < today;
              return (
                <tr key={r.id} className="group hover:bg-slate-50">
                  <td className="px-3 py-2">
                    {(r.status === 'pending' || r.status === 'overdue') && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggle(r.id)}
                        aria-label="Auswählen"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={isOverdueCalc ? 'font-medium text-red-700' : ''}>
                      {formatDate(r.due_date)}
                    </span>
                    {r.paid_date && (
                      <div className="text-xs text-slate-500">
                        bezahlt am {formatDate(r.paid_date)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {r.booking_id ? (
                      <Link
                        href={{ pathname: `/bookings/${r.booking_id}` }}
                        className="hover:underline"
                      >
                        {r.apartment_number ?? '–'}
                      </Link>
                    ) : (
                      (r.apartment_number ?? '–')
                    )}
                  </td>
                  <td className="px-3 py-2">{r.tenant_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {paymentTypeLabel[r.type]}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {formatMoney(r.amount)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Badge tone={paymentStatusTone[r.status]}>
                      {paymentStatusLabel[r.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                    {paymentMethodLabel[r.method]}
                    {r.reference && (
                      <div className="text-xs text-slate-400">{r.reference}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {r.booking_id && (
                      <Link
                        href={{ pathname: `/bookings/${r.booking_id}` }}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-900"
                      >
                        Öffnen
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
