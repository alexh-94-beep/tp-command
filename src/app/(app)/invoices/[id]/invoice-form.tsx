'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Trash2, RotateCcw, MapPin } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  applyApartmentAddress,
  deleteInvoice,
  revertInvoiceToDraft,
  setInvoiceCreated,
  setInvoiceFinal,
  updateInvoice,
} from '@/server/invoices/actions';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import type { DebitorInvoiceStatus } from '@/types/aliases';

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export interface ApartmentOption {
  id: string;
  number: string;
}

export interface InvoiceData {
  id: string;
  status: DebitorInvoiceStatus;
  last_name: string | null;
  first_name: string | null;
  address: string | null;
  apartment_id: string | null;
  apartment_number: string | null;
  service_date: string | null;
  subject: string | null;
  description: string | null;
  amount_chf: number | null;
  attachment_url: string | null;
  attachment_name: string | null;
  invoice_number: string | null;
}

export default function InvoiceForm({
  invoice,
  apartments,
  canEdit,
  canFinalize,
  canMarkCreated,
  canRevert,
  canDelete,
}: {
  invoice: InvoiceData;
  apartments: ApartmentOption[];
  canEdit: boolean;
  canFinalize: boolean;
  canMarkCreated: boolean;
  canRevert: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  function withAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setSavedNote(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  function handleFormSubmit(form: FormData) {
    form.set('invoice_id', invoice.id);
    withAction(() => updateInvoice(form));
    setSavedNote('Gespeichert.');
  }

  function handleApplyAddress() {
    withAction(async () => {
      const r = await applyApartmentAddress(invoice.id);
      return { ok: r.ok, error: r.error };
    });
  }

  function handleFinal() {
    if (!confirm('Rechnung auf Definitiv setzen? Danach ist sie für Sharon sichtbar.')) return;
    withAction(() => setInvoiceFinal(invoice.id));
  }

  function handleMarkCreated() {
    const number = prompt('Rechnungs-Nummer (optional):') ?? undefined;
    const fd = new FormData();
    fd.set('invoice_id', invoice.id);
    if (number) fd.set('invoice_number', number);
    withAction(() => setInvoiceCreated(fd));
  }

  function handleRevert() {
    if (!confirm('Rechnung wieder auf Entwurf zurücksetzen?')) return;
    withAction(() => revertInvoiceToDraft(invoice.id));
  }

  function handleDelete() {
    if (!confirm('Rechnung löschen?')) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteInvoice(invoice.id);
      if (!r.ok) {
        setError(r.error ?? 'Fehler');
        return;
      }
      router.push('/invoices' as never);
    });
  }

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rechnungs-Daten</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          <ReadOnly label="Name" value={invoice.last_name} />
          <ReadOnly label="Vorname" value={invoice.first_name} />
          <ReadOnly label="Adresse" value={invoice.address} multiline />
          <ReadOnly label="Wohnung" value={invoice.apartment_number} />
          <ReadOnly
            label="Datum Leistung"
            value={invoice.service_date ? formatDate(invoice.service_date) : null}
          />
          <ReadOnly label="Betreff" value={invoice.subject} />
          <ReadOnly label="Beschreibung" value={invoice.description} multiline />
          <ReadOnly
            label="Betrag inkl. MwSt"
            value={invoice.amount_chf != null ? formatMoney(Number(invoice.amount_chf)) : null}
          />
          {invoice.attachment_url && (
            <ReadOnly
              label="Anhang"
              value={
                <a
                  href={invoice.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {invoice.attachment_name ?? 'Datei öffnen'}
                </a>
              }
            />
          )}

          <div className="flex flex-wrap gap-2 pt-3">
            {canMarkCreated && (
              <Button onClick={handleMarkCreated} disabled={pending}>
                <CheckCircle2 className="h-4 w-4" />
                Rechnung erstellt markieren
              </Button>
            )}
            {canRevert && (
              <Button variant="secondary" onClick={handleRevert} disabled={pending}>
                <RotateCcw className="h-4 w-4" />
                Zurück auf Entwurf
              </Button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Löschen
              </button>
            )}
          </div>
        </CardBody>
      </Card>
    );
  }

  // canEdit = draft
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rechnungs-Daten (Entwurf)</CardTitle>
      </CardHeader>
      <CardBody>
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {savedNote && (
          <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {savedNote}
          </div>
        )}
        <form action={handleFormSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-500">Vorname</label>
              <input
                name="first_name"
                defaultValue={invoice.first_name ?? ''}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Name *</label>
              <input
                name="last_name"
                defaultValue={invoice.last_name ?? ''}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500">Wohnung (optional)</label>
            <div className="flex gap-2">
              <select
                name="apartment_id"
                defaultValue={invoice.apartment_id ?? ''}
                className={inputCls}
              >
                <option value="">— keine Wohnung —</option>
                {apartments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.number}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyAddress}
                disabled={pending || !invoice.apartment_id}
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                title="Adresse aus gewählter Wohnung übernehmen"
              >
                <MapPin className="h-3.5 w-3.5" />
                Adresse übernehmen
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500">
              Adresse (Strasse + Nr + PLZ + Ort) *
            </label>
            <textarea
              name="address"
              rows={3}
              defaultValue={invoice.address ?? ''}
              placeholder="z.B. C.0305&#10;Sonnentalstrasse 17&#10;8600 Dübendorf"
              className={`${inputCls} font-mono text-xs`}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-500">Datum Leistung *</label>
              <input
                type="date"
                name="service_date"
                defaultValue={invoice.service_date ?? ''}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Betrag inkl. MwSt *</label>
              <input
                type="number"
                name="amount_chf"
                step="0.01"
                defaultValue={invoice.amount_chf ?? ''}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500">Betreff *</label>
            <input
              name="subject"
              defaultValue={invoice.subject ?? ''}
              placeholder="z.B. Sonder-Reinigung Mai 2026"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Beschreibung *</label>
            <textarea
              name="description"
              rows={4}
              defaultValue={invoice.description ?? ''}
              placeholder="Was wurde wann geleistet, was wird verrechnet?"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-500">
                Anhang-URL (optional, Rapport/Beleg)
              </label>
              <input
                name="attachment_url"
                type="url"
                defaultValue={invoice.attachment_url ?? ''}
                placeholder="https://…"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Anhang-Name</label>
              <input
                name="attachment_name"
                defaultValue={invoice.attachment_name ?? ''}
                placeholder="z.B. Rapport_Mai_2026.pdf"
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? 'Speichere…' : 'Entwurf speichern'}
            </Button>
            {canFinalize && (
              <Button type="button" onClick={handleFinal} disabled={pending}>
                <CheckCircle2 className="h-4 w-4" />
                Auf Definitiv setzen
              </Button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Löschen
              </button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function ReadOnly({
  label,
  value,
  multiline,
}: {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="text-xs tracking-wide text-slate-500 uppercase">{label}</div>
      <div
        className={
          multiline
            ? 'mt-0.5 text-sm whitespace-pre-wrap text-slate-700'
            : 'mt-0.5 text-sm text-slate-700'
        }
      >
        {value || '–'}
      </div>
    </div>
  );
}
