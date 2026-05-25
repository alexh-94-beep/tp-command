'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { updateApartment, type UpdateResult } from '@/server/apartments/update';
import {
  apartmentStatusLabel,
  apartmentTypeLabel,
  nameTagLabel,
  ownershipLabel,
  rentalTypeLabel,
} from '@/lib/labels';
import type {
  Apartment,
  ApartmentOwnership,
  ApartmentStatus,
  ApartmentType,
  NameTagStatus,
  RentalType,
} from '@/types/aliases';

const STATUSES: ApartmentStatus[] = [
  'available',
  'occupied',
  'terminated',
  'contract_pending',
  'booking_active',
  'maintenance',
  'blocked',
];
const OWNERSHIPS: ApartmentOwnership[] = ['own', 'sold_managed', 'sold_external'];
const TYPES: ApartmentType[] = ['junior', 'senior', 'suite', 'studio'];
const NAME_TAGS: NameTagStatus[] = ['pending', 'ordered', 'installed'];
const RENTAL_TYPES: RentalType[] = ['long_term', 'short_term', 'booking'];

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return <p className="mt-1 text-xs text-red-600">{errors.join(', ')}</p>;
}

const labelCls = 'block text-sm font-medium text-slate-700';
const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:bg-slate-50';

export default function EditApartmentForm({ apartment }: { apartment: Apartment }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UpdateResult | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const r = await updateApartment(fd);
      // Bei Erfolg redirected die Server-Action selbst -> wir sehen das Ergebnis nur bei Fehler.
      if (r && !r.ok) setResult(r);
    });
  }

  const fe = result?.fieldErrors ?? {};

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="id" value={apartment.id} />

      {result?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {result.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Stammdaten ── */}
        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Wohnungsnummer</label>
                <input className={inputCls} value={apartment.number} disabled />
              </div>
              <div>
                <label className={labelCls}>Gebäude</label>
                <input
                  className={inputCls}
                  name="building"
                  defaultValue={apartment.building}
                  required
                />
                <FieldError errors={fe.building} />
              </div>
              <div>
                <label className={labelCls}>Typ</label>
                <select className={inputCls} name="type" defaultValue={apartment.type}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {apartmentTypeLabel[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Etage</label>
                <input
                  type="number"
                  className={inputCls}
                  name="floor"
                  defaultValue={apartment.floor ?? ''}
                />
              </div>
              <div>
                <label className={labelCls}>Fläche (m²)</label>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  name="size_sqm"
                  defaultValue={apartment.size_sqm ?? ''}
                />
              </div>
              <div>
                <label className={labelCls}>Ausrichtung</label>
                <input
                  className={inputCls}
                  name="orientation"
                  defaultValue={apartment.orientation ?? ''}
                  placeholder="z.B. Nord/Ost"
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* ── Status & Eigentum ── */}
        <Card>
          <CardHeader>
            <CardTitle>Status &amp; Eigentum</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} name="status" defaultValue={apartment.status}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {apartmentStatusLabel[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Eigentum</label>
              <select className={inputCls} name="ownership" defaultValue={apartment.ownership}>
                {OWNERSHIPS.map((o) => (
                  <option key={o} value={o}>
                    {ownershipLabel[o]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                <strong>sold_external</strong> = nicht in Dashboard-KPIs gezählt.
              </p>
            </div>
            <div>
              <label className={labelCls}>Türschild-Status</label>
              <select
                className={inputCls}
                name="name_tag_status"
                defaultValue={apartment.name_tag_status}
              >
                {NAME_TAGS.map((n) => (
                  <option key={n} value={n}>
                    {nameTagLabel[n]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Möblierungsgrad (0.000 – 1.000)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                max="1"
                className={inputCls}
                name="furnishing_completion"
                defaultValue={apartment.furnishing_completion}
              />
            </div>
          </CardBody>
        </Card>

        {/* ── Vermietung ── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Vermietung</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className={labelCls}>Erlaubte Vermietungsarten</label>
              <div className="mt-2 flex flex-wrap gap-4">
                {RENTAL_TYPES.map((t) => (
                  <label key={t} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="allowed_rental_types"
                      value={t}
                      defaultChecked={apartment.allowed_rental_types.includes(t)}
                    />
                    {rentalTypeLabel[t]}
                  </label>
                ))}
              </div>
              <FieldError errors={fe.allowed_rental_types} />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div>
                <label className={labelCls}>Standardmiete (CHF/Mt)</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  name="standard_rent"
                  defaultValue={apartment.standard_rent}
                  required
                />
                <FieldError errors={fe.standard_rent} />
              </div>
              <div>
                <label className={labelCls}>Kurzzeitpauschale</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  name="short_term_flat_rate"
                  defaultValue={apartment.short_term_flat_rate ?? ''}
                />
              </div>
              <div>
                <label className={labelCls}>Booking-Priorität (0–100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className={inputCls}
                  name="booking_priority"
                  defaultValue={apartment.booking_priority}
                />
              </div>
              <div>
                <label className={labelCls}>Reinigungspuffer (h)</label>
                <input
                  type="number"
                  min="0"
                  max="48"
                  className={inputCls}
                  name="cleaning_buffer_hours"
                  defaultValue={apartment.cleaning_buffer_hours}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="flex items-end gap-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="has_parking"
                    defaultChecked={apartment.has_parking}
                  />
                  Parkplatz vorhanden
                </label>
              </div>
              <div>
                <label className={labelCls}>Parking-Gebühr</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  name="parking_fee"
                  defaultValue={apartment.parking_fee ?? ''}
                />
              </div>
              <div>
                <label className={labelCls}>Verkaufspreis</label>
                <input
                  type="number"
                  step="1"
                  className={inputCls}
                  name="sale_price"
                  defaultValue={apartment.sale_price ?? ''}
                />
              </div>
              <div>
                <label className={labelCls}>3D-Modell-Link</label>
                <input
                  type="url"
                  className={inputCls}
                  name="external_link_3d"
                  defaultValue={apartment.external_link_3d ?? ''}
                  placeholder="https://…"
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Notizen</CardTitle>
          </CardHeader>
          <CardBody>
            <textarea
              className={`${inputCls} min-h-[100px]`}
              name="notes"
              defaultValue={apartment.notes ?? ''}
            />
          </CardBody>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(`/apartments/${apartment.id}`)}
        >
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Speichere …' : 'Änderungen speichern'}
        </Button>
      </div>
    </form>
  );
}
