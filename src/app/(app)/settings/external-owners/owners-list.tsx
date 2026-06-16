'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  createExternalOwner,
  createExternalApartment,
  updateExternalOwner,
  setExternalOwnerActive,
  deleteExternalApartment,
} from '@/server/cleaning/externals';

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export interface OwnerWithApartments {
  id: string;
  name: string;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  apartments: { id: string; label: string; address: string | null }[];
}

export default function ExternalOwnersList({
  owners,
}: {
  owners: OwnerWithApartments[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [addAptForId, setAddAptForId] = useState<string | null>(null);

  function withAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Fehler');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowNew((v) => !v)}>
          <Plus className="h-4 w-4" />
          Neuer Eigentümer
        </Button>
      </div>

      {showNew && (
        <NewOwnerForm
          pending={pending}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            router.refresh();
          }}
        />
      )}

      {owners.length === 0 && !showNew && (
        <p className="text-sm text-slate-500">
          Noch keine Eigentümer erfasst.
        </p>
      )}

      <div className="space-y-3">
        {owners.map((o) => (
          <Card key={o.id}>
            <CardHeader className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <CardTitle>
                  {o.name}
                  {!o.is_active && (
                    <Badge tone="neutral" className="ml-2">
                      inaktiv
                    </Badge>
                  )}
                </CardTitle>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  {o.contact_phone && <span>📞 {o.contact_phone}</span>}
                  {o.contact_email && <span>✉ {o.contact_email}</span>}
                  {o.address && <span>📍 {o.address}</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setEditId(editId === o.id ? null : o.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() =>
                    withAction(() => setExternalOwnerActive(o.id, !o.is_active))
                  }
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {o.is_active ? (
                    <>
                      <X className="h-3.5 w-3.5" /> Deaktivieren
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" /> Aktivieren
                    </>
                  )}
                </button>
              </div>
            </CardHeader>
            <CardBody>
              {editId === o.id ? (
                <EditOwnerForm
                  owner={o}
                  pending={pending}
                  onClose={() => setEditId(null)}
                  onSaved={() => {
                    setEditId(null);
                    router.refresh();
                  }}
                />
              ) : (
                <>
                  {o.notes && (
                    <p className="mb-2 rounded border border-slate-100 bg-slate-50 p-2 text-xs whitespace-pre-wrap text-slate-700">
                      {o.notes}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Wohnungen ({o.apartments.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setAddAptForId(addAptForId === o.id ? null : o.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Wohnung hinzufügen
                    </button>
                  </div>
                  {addAptForId === o.id && (
                    <NewApartmentForm
                      ownerId={o.id}
                      pending={pending}
                      onClose={() => setAddAptForId(null)}
                      onSaved={() => {
                        setAddAptForId(null);
                        router.refresh();
                      }}
                    />
                  )}
                  {o.apartments.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Noch keine Wohnungen.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {o.apartments.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-start justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{a.label}</div>
                            {a.address && (
                              <div className="text-xs text-slate-500">{a.address}</div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm(`Wohnung ${a.label} loeschen?`)) return;
                              withAction(() => deleteExternalApartment(a.id));
                            }}
                            disabled={pending}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function NewOwnerForm({
  pending,
  onClose,
  onSaved,
}: {
  pending: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(form: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await createExternalOwner(form);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else onSaved();
    });
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
    >
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input name="name" required placeholder="Name / Firma *" className={inputCls} />
        <input name="contact_phone" placeholder="Telefon" className={inputCls} />
        <input name="contact_email" type="email" placeholder="E-Mail" className={inputCls} />
        <input name="address" placeholder="Adresse" className={inputCls} />
      </div>
      <textarea
        name="notes"
        rows={2}
        placeholder="Notiz (optional)"
        className={`${inputCls} font-mono text-xs`}
      />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={pending || submitting}>
          {submitting ? 'Speichere…' : 'Anlegen'}
        </Button>
      </div>
    </form>
  );
}

function EditOwnerForm({
  owner,
  pending,
  onClose,
  onSaved,
}: {
  owner: OwnerWithApartments;
  pending: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(form: FormData) {
    setError(null);
    form.set('owner_id', owner.id);
    startTransition(async () => {
      const r = await updateExternalOwner(form);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else onSaved();
    });
  }

  return (
    <form action={handleSubmit} className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="name"
          required
          defaultValue={owner.name}
          placeholder="Name / Firma *"
          className={inputCls}
        />
        <input
          name="contact_phone"
          defaultValue={owner.contact_phone ?? ''}
          placeholder="Telefon"
          className={inputCls}
        />
        <input
          name="contact_email"
          type="email"
          defaultValue={owner.contact_email ?? ''}
          placeholder="E-Mail"
          className={inputCls}
        />
        <input
          name="address"
          defaultValue={owner.address ?? ''}
          placeholder="Adresse"
          className={inputCls}
        />
      </div>
      <textarea
        name="notes"
        rows={2}
        defaultValue={owner.notes ?? ''}
        placeholder="Notiz (optional)"
        className={`${inputCls} font-mono text-xs`}
      />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={pending || submitting}>
          {submitting ? 'Speichere…' : 'Speichern'}
        </Button>
      </div>
    </form>
  );
}

function NewApartmentForm({
  ownerId,
  pending,
  onClose,
  onSaved,
}: {
  ownerId: string;
  pending: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(form: FormData) {
    setError(null);
    form.set('owner_id', ownerId);
    startTransition(async () => {
      const r = await createExternalApartment(form);
      if (!r.ok) setError(r.error ?? 'Fehler');
      else onSaved();
    });
  }

  return (
    <form
      action={handleSubmit}
      className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
    >
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="label"
          required
          placeholder="Wohnungs-Nr. (z.B. E.2203) *"
          className={inputCls}
        />
        <input name="address" placeholder="Adresse (optional)" className={inputCls} />
      </div>
      <input name="notes" placeholder="Notiz (optional)" className={inputCls} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={pending || submitting}>
          {submitting ? 'Speichere…' : 'Wohnung hinzufügen'}
        </Button>
      </div>
    </form>
  );
}
