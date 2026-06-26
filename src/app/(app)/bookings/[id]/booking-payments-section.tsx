'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, CheckCircle2, X, RotateCcw, RefreshCw } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  createPayment,
  deletePayment,
  markCancelled,
  markPaid,
  markPending,
  regeneratePlannedPayments,
} from '@/server/payments/actions';
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

export interface PaymentRow {
  id: string;
  type: PaymentType;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: PaymentStatus;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
}

const TYPE_CHOICES: PaymentType[] = [
  'rent',
  'first_rent',
  'deposit',
  'short_term_flat',
  'booking_payout',
  'parking',
  'other',
];

const METHOD_CHOICES: PaymentMethod[] = [
  'bank_transfer',
  'manual_slip',
  'booking_payout',
  'flatfox',
  'card',
  'sumup',
  'other',
];

export default function BookingPaymentsSection({
  bookingId,
  payments,
}: {
  bookingId: string;
  payments: PaymentRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const today = todayIso();
  const sumOpen = payments
    .filter((p) => p.status === 'pending' || p.status === 'overdue')
    .reduce((acc, p) => acc + p.amount, 0);
  const sumPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((acc, p) => acc + p.amount, 0);

  function withAction<T>(fn: () => Promise<{ ok: boolean; error?: string } & T>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <div>
          <CardTitle>Zahlungen</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Offen: {formatMoney(sumOpen)} · Bezahlt: {formatMoney(sumPaid)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              withAction(() => regeneratePlannedPayments(bookingId))
            }
            disabled={pending}
            title="Fehlende Plan-Zahlungen aus den Templates erzeugen"
          >
            <RefreshCw className="h-4 w-4" />
            Plan-Zahlungen erzeugen
          </Button>
          <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-4 w-4" />
            Neue Zahlung
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {showAdd && (
          <AddPaymentForm
            bookingId={bookingId}
            onClose={() => setShowAdd(false)}
            onSaved={() => {
              setShowAdd(false);
              router.refresh();
            }}
          />
        )}

        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">
            Noch keine Zahlungen. Klicke &bdquo;Plan-Zahlungen erzeugen&ldquo;, um die
            Standard-Eintraege fuer diese Buchung anzulegen.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Typ</th>
                  <th className="px-3 py-2">Fällig</th>
                  <th className="px-3 py-2 text-right">Betrag</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Methode / Ref.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => {
                  const isOverdueCalc =
                    (p.status === 'pending' || p.status === 'overdue') &&
                    p.due_date < today;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {paymentTypeLabel[p.type]}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={isOverdueCalc ? 'font-medium text-red-700' : ''}
                        >
                          {formatDate(p.due_date)}
                        </span>
                        {p.paid_date && (
                          <div className="text-xs text-slate-500">
                            bezahlt {formatDate(p.paid_date)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {formatMoney(p.amount)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge tone={paymentStatusTone[p.status]}>
                          {paymentStatusLabel[p.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-600">
                        {paymentMethodLabel[p.method]}
                        {p.reference && (
                          <div className="text-slate-400">{p.reference}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <PaymentRowActions
                          payment={p}
                          pending={pending}
                          onMarkPaid={() => {
                            const fd = new FormData();
                            fd.set('payment_id', p.id);
                            fd.set('paid_date', today);
                            withAction(() => markPaid(fd));
                          }}
                          onMarkPending={() =>
                            withAction(() => markPending(p.id))
                          }
                          onCancel={() => withAction(() => markCancelled(p.id))}
                          onDelete={() => {
                            if (!confirm('Zahlung wirklich loeschen?')) return;
                            withAction(() => deletePayment(p.id));
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function PaymentRowActions({
  payment,
  pending,
  onMarkPaid,
  onMarkPending,
  onCancel,
  onDelete,
}: {
  payment: PaymentRow;
  pending: boolean;
  onMarkPaid: () => void;
  onMarkPending: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const isOpen = payment.status === 'pending' || payment.status === 'overdue';
  return (
    <div className="flex justify-end gap-1">
      {isOpen && (
        <button
          type="button"
          onClick={onMarkPaid}
          disabled={pending}
          title="Als bezahlt markieren"
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Bezahlt
        </button>
      )}
      {payment.status === 'paid' && (
        <button
          type="button"
          onClick={onMarkPending}
          disabled={pending}
          title="Zurueck auf offen"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      {payment.status !== 'cancelled' && (
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          title="Stornieren"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {payment.status === 'cancelled' && (
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          title="Loeschen"
          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Loeschen
        </button>
      )}
    </div>
  );
}

function AddPaymentForm({
  bookingId,
  onClose,
  onSaved,
}: {
  bookingId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(form: FormData) {
    setError(null);
    form.set('booking_id', bookingId);
    startTransition(async () => {
      const r = await createPayment(form);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else onSaved();
    });
  }

  return (
    <form
      action={handleSubmit}
      className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3"
    >
      {error && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        <select
          name="type"
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          defaultValue="rent"
        >
          {TYPE_CHOICES.map((t) => (
            <option key={t} value={t}>
              {paymentTypeLabel[t]}
            </option>
          ))}
        </select>
        <input
          name="amount"
          type="number"
          step="0.01"
          required
          placeholder="Betrag"
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        <input
          name="due_date"
          type="date"
          required
          defaultValue={todayIso()}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        <select
          name="method"
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          defaultValue="bank_transfer"
        >
          {METHOD_CHOICES.map((m) => (
            <option key={m} value={m}>
              {paymentMethodLabel[m]}
            </option>
          ))}
        </select>
        <input
          name="reference"
          type="text"
          placeholder="Referenz / Buchungs-Nr"
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Speichere…' : 'Anlegen'}
        </Button>
      </div>
    </form>
  );
}
