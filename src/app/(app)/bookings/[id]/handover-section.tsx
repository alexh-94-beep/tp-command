'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import {
  clearHandoverPlan,
  markHandoverDone,
  planHandover,
  undoHandover,
} from '@/server/cleaning/actions';
import {
  clearMoveInPlan,
  markMoveInDone,
  planMoveIn,
  undoMoveIn,
} from '@/server/move-in/actions';
import { formatDate } from '@/lib/dates';

interface Props {
  bookingId: string;
  rentalType: string;
  /* Move-in (Übergabe) */
  moveInPlannedAt?: string | null;
  moveInCompletedAt?: string | null;
  moveInByName?: string | null;
  /* Move-out (Abnahme) */
  handoverPlannedAt: string | null;
  handoverCompletedAt: string | null;
  handoverByName: string | null;
}

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function HandoverSection({
  bookingId,
  rentalType,
  moveInPlannedAt,
  moveInCompletedAt,
  moveInByName,
  handoverPlannedAt,
  handoverCompletedAt,
  handoverByName,
}: Props) {
  // Booking-Aufenthalte (Booking.com etc.) brauchen weder Übergabe-Termin
  // noch Abnahme – Self-Check-in via Schlüsselbox.
  if (rentalType === 'booking') return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Wohnungsübergabe (Einzug)</CardTitle>
        </CardHeader>
        <CardBody>
          <HandoverBlock
            mode="move_in"
            bookingId={bookingId}
            plannedAt={moveInPlannedAt ?? null}
            completedAt={moveInCompletedAt ?? null}
            doneByName={moveInByName ?? null}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wohnungsabnahme (Auszug)</CardTitle>
        </CardHeader>
        <CardBody>
          <HandoverBlock
            mode="move_out"
            bookingId={bookingId}
            plannedAt={handoverPlannedAt}
            completedAt={handoverCompletedAt}
            doneByName={handoverByName}
          />
        </CardBody>
      </Card>
    </div>
  );
}

interface BlockProps {
  mode: 'move_in' | 'move_out';
  bookingId: string;
  plannedAt: string | null;
  completedAt: string | null;
  doneByName: string | null;
}

function HandoverBlock({ mode, bookingId, plannedAt, completedAt, doneByName }: BlockProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [planDate, setPlanDate] = useState(plannedAt ? plannedAt.slice(0, 10) : '');
  const [planTime, setPlanTime] = useState(
    plannedAt ? new Date(plannedAt).toTimeString().slice(0, 5) : '10:00',
  );

  const isMoveIn = mode === 'move_in';
  const labels = isMoveIn
    ? {
        intro:
          'Plane den Übergabetermin oder markiere die Übergabe direkt als erledigt. Du kannst das Übergabeprotokoll als PDF anhängen.',
        plannedNote: 'Übergabetermin geplant',
        doneNote: 'Übergabe erledigt',
        planTitle: plannedAt ? 'Plan ändern' : 'Übergabe planen',
        markTitle: 'Übergabe als erledigt markieren',
        markHint: 'Wenn die Wohnung an den Mieter übergeben wurde – optional Übergabeprotokoll als PDF anhängen.',
        markBtn: 'Übergabe erledigt',
      }
    : {
        intro:
          'Plane die Abnahme oder markiere sie direkt als erledigt. Sobald ein Plan oder eine Erledigung gesetzt ist, wird automatisch ein Reinigungs-Auftrag erzeugt.',
        plannedNote: 'Abnahme geplant',
        doneNote: 'Abnahme erledigt',
        planTitle: plannedAt ? 'Plan ändern' : 'Abnahme planen',
        markTitle: 'Abnahme als erledigt markieren',
        markHint: 'Wenn die Wohnung wirklich übernommen wurde – optional Abnahmeprotokoll als PDF anhängen.',
        markBtn: 'Abnahme erledigt',
      };

  function savePlan() {
    if (!planDate) return;
    setError(null);
    const iso = `${planDate}T${planTime}:00+02:00`;
    startTransition(async () => {
      const r = isMoveIn
        ? await planMoveIn({ bookingId, plannedAtIso: iso })
        : await planHandover({ bookingId, plannedAtIso: iso });
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  function clearPlan() {
    if (
      !window.confirm(
        isMoveIn
          ? 'Geplanten Übergabetermin entfernen?'
          : 'Geplante Abnahme entfernen? Offener Reinigungs-Auftrag wird gelöscht.',
      )
    )
      return;
    startTransition(async () => {
      const r = isMoveIn
        ? await clearMoveInPlan(bookingId)
        : await clearHandoverPlan(bookingId);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  function markDone() {
    setError(null);
    startTransition(async () => {
      let base64: string | undefined;
      let filename: string | undefined;
      if (pdfFile) {
        const buf = await pdfFile.arrayBuffer();
        base64 = btoa(new Uint8Array(buf).reduce((a, b) => a + String.fromCharCode(b), ''));
        filename = pdfFile.name;
      }
      const r = isMoveIn
        ? await markMoveInDone({ bookingId, pdfBase64: base64, pdfFilename: filename })
        : await markHandoverDone({ bookingId, pdfBase64: base64, pdfFilename: filename });
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  function undo() {
    if (!window.confirm(isMoveIn ? 'Übergabe rückgängig machen?' : 'Abnahme rückgängig machen?'))
      return;
    startTransition(async () => {
      const r = isMoveIn ? await undoMoveIn(bookingId) : await undoHandover(bookingId);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Status oben */}
      {completedAt ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          ✓ {labels.doneNote} am {formatDate(completedAt)}
          {doneByName ? ` durch ${doneByName}` : ''}
          {isMoveIn ? '.' : ' – Reinigungs-Auftrag ist erzeugt.'}
          <div className="mt-2">
            <Button variant="secondary" size="sm" onClick={undo} disabled={pending}>
              Rückgängig
            </Button>
          </div>
        </div>
      ) : plannedAt ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          🕐 {labels.plannedNote}: {formatDate(plannedAt)} um{' '}
          {new Date(plannedAt).toLocaleTimeString('de-CH', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {!isMoveIn && ' – Reinigungs-Auftrag wurde für 1 h danach angelegt.'}
        </div>
      ) : (
        <p className="text-sm text-slate-600">{labels.intro}</p>
      )}

      {/* Plan-Form */}
      {!completedAt && (
        <div className="rounded-md border border-slate-200 p-3">
          <h3 className="text-sm font-medium text-slate-700">{labels.planTitle}</h3>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Datum</label>
              <DateInput
                name={`${mode}_plan_date`}
                value={planDate}
                onChange={setPlanDate}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Uhrzeit</label>
              <input
                type="time"
                className={`${inputCls} mt-1`}
                value={planTime}
                onChange={(e) => setPlanTime(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={savePlan} disabled={pending || !planDate}>
              {pending ? 'Speichere …' : plannedAt ? 'Plan aktualisieren' : 'Plan speichern'}
            </Button>
            {plannedAt && (
              <Button variant="secondary" onClick={clearPlan} disabled={pending}>
                Plan entfernen
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Erledigt-Markierung mit optionalem PDF */}
      {!completedAt && (
        <div className="rounded-md border border-slate-200 p-3">
          <h3 className="text-sm font-medium text-slate-700">{labels.markTitle}</h3>
          <p className="mt-1 text-xs text-slate-500">{labels.markHint}</p>
          <div className="mt-2">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
            />
            {pdfFile && (
              <p className="mt-1 text-xs text-slate-500">
                {pdfFile.name} · {(pdfFile.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>
          <div className="mt-3">
            <Button onClick={markDone} disabled={pending}>
              {labels.markBtn}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
