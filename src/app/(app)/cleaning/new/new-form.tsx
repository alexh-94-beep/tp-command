'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { createCleaningTask } from '@/server/cleaning/actions';

interface Apartment {
  id: string;
  number: string;
}
interface External {
  id: string;
  label: string;
}
interface Cleaner {
  id: string;
  full_name: string;
}

const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';
const labelCls = 'block text-sm font-medium text-slate-700';

type Target = 'internal' | 'external_existing' | 'external_new';

export default function NewCleaningTaskForm({
  apartments,
  externals,
  cleaners,
}: {
  apartments: Apartment[];
  externals: External[];
  cleaners: Cleaner[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<Target>('internal');
  const [scheduledDate, setScheduledDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);

    // Nicht-relevante Felder pro Modus rausnehmen
    if (target === 'internal') {
      fd.delete('external_apartment_id');
      fd.delete('new_external_label');
      fd.delete('new_external_address');
      fd.delete('new_external_contact_name');
      fd.delete('new_external_contact_phone');
      fd.delete('new_external_contact_email');
    } else if (target === 'external_existing') {
      fd.delete('apartment_id');
      fd.delete('new_external_label');
      fd.delete('new_external_address');
      fd.delete('new_external_contact_name');
      fd.delete('new_external_contact_phone');
      fd.delete('new_external_contact_email');
    } else {
      fd.delete('apartment_id');
      fd.delete('external_apartment_id');
    }

    startTransition(async () => {
      const r = await createCleaningTask(fd);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.push(`/cleaning/${r.taskId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ---------- Wohnung ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Wohnung</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="target"
                checked={target === 'internal'}
                onChange={() => setTarget('internal')}
              />
              Wohnung im Bestand
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="target"
                checked={target === 'external_existing'}
                onChange={() => setTarget('external_existing')}
              />
              Bestehende externe Wohnung
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="target"
                checked={target === 'external_new'}
                onChange={() => setTarget('external_new')}
              />
              Neue externe Wohnung anlegen
            </label>
          </div>

          {target === 'internal' && (
            <select className={inputCls} name="apartment_id" required>
              <option value="">– wählen –</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.number}
                </option>
              ))}
            </select>
          )}

          {target === 'external_existing' && (
            <select className={inputCls} name="external_apartment_id" required>
              <option value="">– wählen –</option>
              {externals.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
              {externals.length === 0 && <option disabled>Noch keine externen Wohnungen</option>}
            </select>
          )}

          {target === 'external_new' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Bezeichnung *</label>
                <input
                  className={inputCls}
                  name="new_external_label"
                  placeholder="z. B. Familie Müller, Stallstrasse 4"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Adresse</label>
                <input
                  className={inputCls}
                  name="new_external_address"
                  placeholder="Strasse, PLZ Ort"
                />
              </div>
              <div>
                <label className={labelCls}>Kontaktperson</label>
                <input className={inputCls} name="new_external_contact_name" />
              </div>
              <div>
                <label className={labelCls}>Telefon</label>
                <input
                  className={inputCls}
                  name="new_external_contact_phone"
                  placeholder="+41 …"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>E-Mail</label>
                <input type="email" className={inputCls} name="new_external_contact_email" />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ---------- Termin & Zutritt ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Termin & Zutritt</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Datum *</label>
              <DateInput
                name="scheduled_date"
                value={scheduledDate}
                onChange={setScheduledDate}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className={labelCls}>Uhrzeit</label>
              <input type="time" name="scheduled_time" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Zutritt</label>
              <select className={inputCls} name="access_method" defaultValue="">
                <option value="">– wählen –</option>
                <option value="key_available">Schlüssel ist bei uns</option>
                <option value="customer_at_home">Kunde ist zuhause</option>
                <option value="key_at_reception">Schlüssel beim Empfang</option>
                <option value="key_box">Schlüsselbox</option>
                <option value="other">Anders (siehe Notiz)</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Zutritts-Notiz (optional)</label>
            <input
              className={inputCls}
              name="access_notes"
              placeholder="z. B. Code 1234, Klingel Müller, Schlüssel-Nr. 12"
            />
          </div>
        </CardBody>
      </Card>

      {/* ---------- Auftrags-Details ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Auftrag</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Typ</label>
              <select className={inputCls} name="type" defaultValue="special">
                <option value="checkout">Auszugs-Reinigung</option>
                <option value="pre_checkin">Pre-Checkin</option>
                <option value="intermediate">Wiederkehrend</option>
                <option value="weekly_clean">Wöchentlich</option>
                <option value="inspection">Inspektion</option>
                <option value="special">Spezial</option>
                <option value="deep_clean">Endreinigung</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Priorität</label>
              <select className={inputCls} name="priority" defaultValue="normal">
                <option value="low">Tief</option>
                <option value="normal">Normal</option>
                <option value="high">Hoch</option>
                <option value="urgent">Dringend</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Zugewiesen an</label>
              <select className={inputCls} name="staff_id" defaultValue="">
                <option value="">– Niemand –</option>
                {cleaners.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Notizen</label>
            <textarea className={`${inputCls} min-h-[80px]`} name="notes" />
          </div>
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.push('/cleaning')}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending || !scheduledDate}>
          {pending ? 'Speichere …' : 'Auftrag anlegen'}
        </Button>
      </div>
    </form>
  );
}
