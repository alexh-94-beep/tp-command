'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Plus, Send, X, Trash2 } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  cancelDraft,
  createDraft,
  deleteCommunication,
  sendDraft,
  updateDraft,
} from '@/server/communications/actions';
import { formatDate, formatTime } from '@/lib/dates';
import {
  communicationStatusLabel,
  communicationStatusTone,
  communicationTypeLabel,
} from '@/lib/labels';
import { PUBLIC_TEMPLATES } from '@/services/communications/templates';
import type { CommunicationStatus, CommunicationType } from '@/types/aliases';

export interface CommunicationRow {
  id: string;
  type: CommunicationType;
  recipient: string;
  subject: string | null;
  body: string | null;
  status: CommunicationStatus;
  sent_at: string | null;
  created_at: string;
}

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function BookingCommunicationsSection({
  bookingId,
  communications,
}: {
  bookingId: string;
  communications: CommunicationRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  function withAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  const sortedRows = [...communications].sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );

  return (
    <Card>
      <CardHeader className="flex items-start justify-between">
        <div>
          <CardTitle>Kommunikation</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            E-Mails an den Mieter / Gast. Drafts können vor dem Senden angepasst werden.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowWizard((v) => !v)}>
          <Plus className="h-4 w-4" />
          Neue Mail
        </Button>
      </CardHeader>
      <CardBody>
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {showWizard && (
          <NewMailWizard
            bookingId={bookingId}
            onClose={() => setShowWizard(false)}
            onCreated={() => {
              setShowWizard(false);
              router.refresh();
            }}
          />
        )}

        {sortedRows.length === 0 ? (
          <p className="text-sm text-slate-500">
            Noch keine E-Mails. Klicke &bdquo;Neue Mail&ldquo;, um einen Entwurf
            aus einer Vorlage zu erzeugen.
          </p>
        ) : (
          <div className="space-y-2">
            {sortedRows.map((c) => (
              <CommunicationRowItem
                key={c.id}
                comm={c}
                expanded={previewId === c.id}
                onToggle={() => setPreviewId(previewId === c.id ? null : c.id)}
                onSend={() => {
                  if (!confirm('Mail jetzt versenden?')) return;
                  withAction(() => sendDraft(c.id));
                }}
                onCancel={() => withAction(() => cancelDraft(c.id))}
                onDelete={() => {
                  if (!confirm('Mail loeschen?')) return;
                  withAction(() => deleteCommunication(c.id));
                }}
                onSave={(subject, body) => {
                  const fd = new FormData();
                  fd.set('communication_id', c.id);
                  fd.set('subject', subject);
                  fd.set('body', body);
                  withAction(() => updateDraft(fd));
                }}
                pending={pending}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function CommunicationRowItem({
  comm,
  expanded,
  onToggle,
  onSend,
  onCancel,
  onDelete,
  onSave,
  pending,
}: {
  comm: CommunicationRow;
  expanded: boolean;
  onToggle: () => void;
  onSend: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (subject: string, body: string) => void;
  pending: boolean;
}) {
  const [subject, setSubject] = useState(comm.subject ?? '');
  const [body, setBody] = useState(comm.body ?? '');
  const editable = comm.status === 'draft';
  const sendable = comm.status === 'draft' || comm.status === 'failed';
  const dirty = subject !== (comm.subject ?? '') || body !== (comm.body ?? '');

  return (
    <div className="rounded-md border border-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-slate-50"
      >
        <Mail className="mt-0.5 h-4 w-4 text-slate-400" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{communicationTypeLabel[comm.type]}</span>
            <Badge tone={communicationStatusTone[comm.status]}>
              {communicationStatusLabel[comm.status]}
            </Badge>
            <span className="text-xs text-slate-500">
              an {comm.recipient}
            </span>
          </div>
          {comm.subject && (
            <div className="mt-0.5 truncate text-xs text-slate-500">
              {comm.subject}
            </div>
          )}
          {comm.sent_at && (
            <div className="mt-0.5 text-xs text-slate-400">
              Gesendet {formatDate(comm.sent_at)} um {formatTime(comm.sent_at)}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-3 py-3">
          {editable ? (
            <>
              <label className="block text-xs text-slate-500">Betreff</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={inputCls}
              />
              <label className="mt-3 block text-xs text-slate-500">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                className={`${inputCls} font-mono text-xs`}
              />
              <div className="mt-2 flex justify-end gap-2">
                {dirty && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onSave(subject, body)}
                    disabled={pending}
                  >
                    Speichern
                  </Button>
                )}
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Stornieren
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Löschen
                </button>
                <Button size="sm" onClick={onSend} disabled={pending}>
                  <Send className="h-3.5 w-3.5" />
                  Senden
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-500">Betreff</div>
              <div className="text-sm font-medium">{comm.subject ?? '–'}</div>
              <div className="mt-3 text-xs text-slate-500">Body</div>
              <pre className="mt-1 max-h-96 overflow-auto rounded border border-slate-100 bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">
                {comm.body ?? ''}
              </pre>
              {sendable && (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" onClick={onSend} disabled={pending}>
                    <Send className="h-3.5 w-3.5" />
                    Erneut senden
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NewMailWizard({
  bookingId,
  onClose,
  onCreated,
}: {
  bookingId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tmpl, setTmpl] = useState<CommunicationType>('welcome');

  function handleSubmit(form: FormData) {
    form.set('booking_id', bookingId);
    form.set('template_key', tmpl);
    setError(null);
    startTransition(async () => {
      const r = await createDraft(form);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else onCreated();
    });
  }

  const needsWifi = tmpl === 'wifi_info';
  const needsCheckin = tmpl === 'checkin_info';
  const needsPayment = tmpl === 'payment_reminder';

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
      <label className="block text-xs text-slate-500">Vorlage</label>
      <select
        value={tmpl}
        onChange={(e) => setTmpl(e.target.value as CommunicationType)}
        className={inputCls}
      >
        {PUBLIC_TEMPLATES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label} — {t.description}
          </option>
        ))}
      </select>

      {needsWifi && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            name="wifi_ssid"
            placeholder="WLAN-Name (SSID)"
            className={inputCls}
          />
          <input
            name="wifi_password"
            placeholder="WLAN-Passwort"
            className={inputCls}
          />
        </div>
      )}

      {needsCheckin && (
        <input
          name="key_box_code"
          placeholder="Code der Schlüsselbox (optional)"
          className={`${inputCls} mt-2`}
        />
      )}

      {needsPayment && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input
            name="payment_amount"
            type="number"
            step="0.01"
            placeholder="Betrag (optional)"
            className={inputCls}
          />
          <input
            name="payment_due_date"
            type="date"
            placeholder="Fällig seit"
            className={inputCls}
          />
          <input
            name="payment_reference"
            placeholder="Referenz / Buchungs-Nr"
            className={inputCls}
          />
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Erzeuge…' : 'Entwurf erzeugen'}
        </Button>
      </div>
    </form>
  );
}
