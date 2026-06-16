import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil, ArrowLeft, Plus } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/money';
import {
  apartmentStatusLabel,
  apartmentStatusTone,
  apartmentTypeLabel,
  nameTagLabel,
  ownershipLabel,
  ownershipTone,
  rentalTypeLabel,
} from '@/lib/labels';
import ApartmentDamagesSection, {
  type DamageRow,
} from './damages-section';

export const metadata = { title: 'Wohnung' };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value ?? '–'}</dd>
    </div>
  );
}

export default async function ApartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: apartment } = await supabase
    .from('apartments')
    .select('*')
    .eq('id', id)
    .single();

  if (!apartment) notFound();

  // Schäden laden (Phase 13.6)
  const { data: rawDamages } = await supabase
    .from('apartment_damages')
    .select(
      'id, description, severity, status, notes, reported_at, resolved_at, resolution_notes, reporter:users!apartment_damages_reported_by_fkey(full_name), resolver:users!apartment_damages_resolved_by_fkey(full_name)',
    )
    .eq('apartment_id', id)
    .order('reported_at', { ascending: false });
  const damages: DamageRow[] = (rawDamages ?? []).map((d) => ({
    id: d.id,
    description: d.description,
    severity: d.severity,
    status: d.status,
    notes: d.notes,
    reported_at: d.reported_at,
    reported_by_name: d.reporter?.full_name ?? null,
    resolved_at: d.resolved_at,
    resolved_by_name: d.resolver?.full_name ?? null,
    resolution_notes: d.resolution_notes,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/apartments" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Liste
          </span>
        </Link>
      </div>

      <PageHeader
        title={`Wohnung ${apartment.number}`}
        description={`${apartmentTypeLabel[apartment.type]} · ${apartment.size_sqm ?? '?'} m² · Etage ${apartment.floor}`}
        actions={
          <div className="flex gap-2">
            <Link href={`/bookings/new?apartment=${apartment.id}`}>
              <Button variant="secondary">
                <Plus className="h-4 w-4" />
                Neue Buchung
              </Button>
            </Link>
            <Link href={`/apartments/${apartment.id}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" />
                Bearbeiten
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={apartmentStatusTone[apartment.status]}>
          {apartmentStatusLabel[apartment.status]}
        </Badge>
        <Badge tone={ownershipTone[apartment.ownership]}>{ownershipLabel[apartment.ownership]}</Badge>
        <Badge tone="neutral">Türschild: {nameTagLabel[apartment.name_tag_status]}</Badge>
        <Badge tone="neutral">Gebäude {apartment.building}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Field label="Wohnungsnummer" value={apartment.number} />
              <Field label="Gebäude" value={apartment.building} />
              <Field label="Typ" value={apartmentTypeLabel[apartment.type]} />
              <Field label="Etage" value={apartment.floor} />
              <Field
                label="Fläche"
                value={apartment.size_sqm ? `${apartment.size_sqm} m²` : null}
              />
              <Field label="Ausrichtung" value={apartment.orientation} />
              <Field
                label="Möblierung"
                value={`${(apartment.furnishing_completion * 100).toFixed(1)} %`}
              />
              <Field label="Türschild" value={nameTagLabel[apartment.name_tag_status]} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vermietung</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Field
                label="Erlaubte Vermietungsarten"
                value={
                  <div className="flex flex-wrap gap-1">
                    {apartment.allowed_rental_types.map((t) => (
                      <Badge key={t} tone="neutral">
                        {rentalTypeLabel[t]}
                      </Badge>
                    ))}
                  </div>
                }
              />
              <Field label="Standardmiete" value={formatMoney(apartment.standard_rent)} />
              <Field
                label="Kurzzeitpauschale"
                value={formatMoney(apartment.short_term_flat_rate)}
              />
              <Field
                label="Parkplatz"
                value={
                  apartment.has_parking ? `Ja (${formatMoney(apartment.parking_fee)})` : 'Nein'
                }
              />
              <Field label="Booking-Priorität" value={apartment.booking_priority} />
              <Field label="Reinigungspuffer" value={`${apartment.cleaning_buffer_hours} h`} />
              <Field label="Verkaufspreis" value={formatMoney(apartment.sale_price)} />
              <Field
                label="3D-Modell"
                value={
                  apartment.external_link_3d ? (
                    <a
                      href={apartment.external_link_3d}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Öffnen
                    </a>
                  ) : null
                }
              />
            </dl>
          </CardBody>
        </Card>

        {apartment.notes && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm whitespace-pre-wrap text-slate-700">{apartment.notes}</p>
            </CardBody>
          </Card>
        )}
      </div>

      <ApartmentDamagesSection apartmentId={apartment.id} damages={damages} />
    </div>
  );
}
