'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import {
  importFlatfoxApplication,
  listApartmentsForFlatfoxAssign,
  type ApartmentLookup,
  type FlatfoxAppRow,
  type ImportFlatfoxResult,
} from '@/server/flatfox/applications';

const labelCls = 'block text-sm font-medium text-slate-700';
const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

interface ImportDialogProps {
  row: FlatfoxAppRow;
  onClose: () => void;
  onSuccess: (result: ImportFlatfoxResult) => void;
}

export function ImportDialog({ row, onClose, onSuccess }: ImportDialogProps) {
  const [pending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState(String(row.rent_gross ?? ''));
  const [depositAmount, setDepositAmount] = useState('');
  const [contractStatus, setContractStatus] = useState<'draft' | 'sent' | 'signed'>('signed');
  const [bookingStatus, setBookingStatus] = useState<'planned' | 'active'>('planned');
  const [error, setError] = useState<string | null>(null);

  // Manuelle Wohnungs-Zuordnung: aktiv, wenn keine matched
  const needsManualAssign = !row.apartment_in_db_id;
  const [apartments, setApartments] = useState<ApartmentLookup[] | null>(null);
  const [apartmentIdOverride, setApartmentIdOverride] = useState<string>('');
  const [apartmentFilter, setApartmentFilter] = useState('');

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // Wohnungen laden, wenn manuelle Zuordnung nötig
  useEffect(() => {
    if (!needsManualAssign) return;
    listApartmentsForFlatfoxAssign().then((r) => {
      if (r.ok && r.rows) setApartments(r.rows);
    });
  }, [needsManualAssign]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!startDate) {
      setError('Einzug ist Pflicht.');
      return;
    }
    if (needsManualAssign && !apartmentIdOverride) {
      setError('Bitte eine Wohnung manuell auswählen.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await importFlatfoxApplication(row.pk, {
        startDate,
        endDate: endDate || undefined,
        rentAmount: Number(rentAmount) || 0,
        depositAmount: Number(depositAmount) || 0,
        contractStatus,
        bookingStatus,
        apartmentIdOverride: apartmentIdOverride || undefined,
      });
      if (!r.ok) {
        setError(r.error ?? 'Unbekannter Fehler');
        return;
      }
      onSuccess(r);
    });
  }

  const filteredApts = (apartments ?? []).filter((a) => {
    if (!apartmentFilter) return true;
    const q = apartmentFilter.toLowerCase();
    return (
      a.number.toLowerCase().includes(q) ||
      (a.building ?? '').toLowerCase().includes(q) ||
      (a.type ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold">
            Anmeldung übernehmen: {row.first_name} {row.last_name}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {row.apartment_number ?? '–'} · {row.email}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {needsManualAssign && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <div className="font-medium text-amber-900">
                Wohnung konnte nicht automatisch zugeordnet werden
              </div>
              <p className="mt-1 text-xs text-amber-800">
                {row.apartment_number
                  ? `Flatfox liefert die Referenz „${row.apartment_number}" – diese Nummer existiert nicht in unserer DB. Bitte unten manuell zuweisen.`
                  : 'Diese Anmeldung enthält keine Wohnungs-Referenz. Bitte unten manuell zuweisen.'}
              </p>
              <div className="mt-3 space-y-2">
                <label className={labelCls}>Wohnung manuell wählen *</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Suche (z. B. C.0406, Haus C, Senior …)"
                  value={apartmentFilter}
                  onChange={(e) => setApartmentFilter(e.target.value)}
                />
                {apartments === null ? (
                  <div className="text-xs text-slate-500">Lade Wohnungen …</div>
                ) : (
                  <select
                    className={inputCls}
                    size={Math.min(8, Math.max(3, filteredApts.length))}
                    value={apartmentIdOverride}
                    onChange={(e) => setApartmentIdOverride(e.target.value)}
                  >
                    <option value="">— Wohnung wählen —</option>
                    {filteredApts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.number}
                        {a.building ? ` · Haus ${a.building}` : ''}
                        {a.type ? ` · ${a.type}` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {apartments && filteredApts.length === 0 && (
                  <div className="text-xs text-slate-500">Keine Treffer für „{apartmentFilter}".</div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Einzug *</label>
              <DateInput
                name="start_date"
                value={startDate}
                onChange={setStartDate}
                className="mt-1"
                required
              />
            </div>
            <div>
              <label className={labelCls}>
                Auszug{' '}
                <span className="text-slate-400">(leer = unbefristet)</span>
              </label>
              <DateInput
                name="end_date"
                value={endDate}
                onChange={setEndDate}
                className="mt-1"
              />
            </div>
            <div>
              <label className={labelCls}>Mietzins (CHF)</label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Depot (CHF)</label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Vertragsstatus</label>
              <select
                className={inputCls}
                value={contractStatus}
                onChange={(e) => setContractStatus(e.target.value as 'draft' | 'sent' | 'signed')}
              >
                <option value="draft">Entwurf</option>
                <option value="sent">Versendet</option>
                <option value="signed">Unterschrieben</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Buchungsstatus</label>
              <select
                className={inputCls}
                value={bookingStatus}
                onChange={(e) => setBookingStatus(e.target.value as 'planned' | 'active')}
              >
                <option value="planned">Geplant</option>
                <option value="active">Aktiv</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Übernehme …' : 'Buchung anlegen'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
