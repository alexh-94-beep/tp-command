'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createStaff, setStaffActive, updateStaff } from '@/server/cleaning/staff';

interface Staff {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
}

const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';
const labelCls = 'block text-xs text-slate-500';

export default function StaffManager({ staff }: { staff: Staff[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleNew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);
    const form = event.currentTarget;
    startTransition(async () => {
      const r = await createStaff(fd);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else {
        form.reset();
        router.refresh();
      }
    });
  }

  function handleUpdate(staffId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const r = await updateStaff(staffId, fd);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function toggleActive(staffId: string, current: boolean) {
    startTransition(async () => {
      await setStaffActive(staffId, !current);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Liste */}
      <div className="space-y-3">
        {staff.map((s) =>
          editingId === s.id ? (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle>{s.full_name} bearbeiten</CardTitle>
              </CardHeader>
              <CardBody>
                <form onSubmit={(e) => handleUpdate(s.id, e)} className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>Name</label>
                      <input className={inputCls} name="full_name" defaultValue={s.full_name} required />
                    </div>
                    <div>
                      <label className={labelCls}>Telefon</label>
                      <input className={inputCls} name="phone" defaultValue={s.phone ?? ''} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>E-Mail</label>
                      <input
                        type="email"
                        className={inputCls}
                        name="email"
                        defaultValue={s.email ?? ''}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Notizen</label>
                      <textarea
                        className={`${inputCls} min-h-[60px]`}
                        name="notes"
                        defaultValue={s.notes ?? ''}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditingId(null)}
                    >
                      Abbrechen
                    </Button>
                    <Button type="submit" disabled={pending}>
                      Speichern
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          ) : (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.full_name}</span>
                  {!s.is_active && <Badge tone="neutral">inaktiv</Badge>}
                </div>
                <div className="text-xs text-slate-500">
                  {s.phone && <span>{s.phone}</span>}
                  {s.phone && s.email && ' · '}
                  {s.email && <span>{s.email}</span>}
                  {!s.phone && !s.email && <span>Kein Kontakt hinterlegt</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => toggleActive(s.id, s.is_active)}
                  disabled={pending}
                >
                  {s.is_active ? 'Deaktivieren' : 'Aktivieren'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEditingId(s.id)}>
                  Bearbeiten
                </Button>
              </div>
            </div>
          ),
        )}
      </div>

      {/* Neuer Eintrag */}
      <Card>
        <CardHeader>
          <CardTitle>Neue Reinigungs-Person hinzufügen</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleNew} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Name *</label>
                <input className={inputCls} name="full_name" required />
              </div>
              <div>
                <label className={labelCls}>Telefon</label>
                <input className={inputCls} name="phone" placeholder="+41 …" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>E-Mail</label>
                <input type="email" className={inputCls} name="email" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                Hinzufügen
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
