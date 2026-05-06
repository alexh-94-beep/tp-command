'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import {
  downloadAttachment,
  getApplication,
  getApplications,
  getListing,
  type FlatfoxApplication,
  type FlatfoxListing,
} from '@/lib/channels/flatfox/client';
import { checkAvailability } from '@/services/availability/check';
import { instantiateBookingTasks } from '@/services/workflow/instantiate';

export interface FlatfoxAppRow {
  pk: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  created: string;
  form_submitted: string | null;
  has_form_data: boolean;
  status: string;
  flat_id: number;
  apartment_number: string | null;
  apartment_label: string | null;
  apartment_in_db_id: string | null; // unsere apartments.id, wenn gematcht
  rent_gross: number | null;
  is_imported: boolean; // ob wir schon eine Buchung dafür haben
  imported_booking_id: string | null;
}

interface ListResult {
  ok: boolean;
  error?: string;
  rows?: FlatfoxAppRow[];
}

/* Hilfsfunktion: aus Listing eine Wohnungsnummer im internen Format ableiten */
function listingToApartmentNumber(l: FlatfoxListing): string | null {
  if (!l.ref_house || !l.ref_object) return null;
  return `${l.ref_house}.${l.ref_object}`;
}

/* -------------------------------------------------- *
 *  LISTE                                              *
 * -------------------------------------------------- */
export interface ListOptions {
  /** Nur Bewerbungen mit ausgefülltem Anmeldeformular (Default: true) */
  onlyWithForm?: boolean;
}

export async function listFlatfoxApplications(options?: ListOptions): Promise<ListResult> {
  await requireRole(['admin', 'office']);
  const onlyWithForm = options?.onlyWithForm ?? true;

  const apps = await getApplications();
  if (!apps.ok || !apps.data) return { ok: false, error: apps.error ?? 'Listen-Abruf fehlgeschlagen' };

  const filtered = onlyWithForm ? apps.data.filter((a) => a.has_form_data) : apps.data;

  const supabase = createSupabaseServerClient();

  // Listings parallel holen, um Wohnungs-Match zu machen.
  const uniqueFlatIds = Array.from(new Set(filtered.map((a) => a.flat)));
  const listings = new Map<number, FlatfoxListing | null>();
  await Promise.all(
    uniqueFlatIds.map(async (id) => {
      const r = await getListing(id);
      listings.set(id, r.ok && r.data ? r.data : null);
    }),
  );

  // Wohnungsnummern-Dictionary aus DB
  // ACHTUNG: Wir matchen case-insensitive – Flatfox liefert manchmal
  // 'c.0406' statt 'C.0406'. Ein extra Index ist nicht nötig, da wir
  // ohnehin lokal in der Map matchen.
  const apartmentNumbersLower = Array.from(listings.values())
    .map((l) => (l ? listingToApartmentNumber(l) : null))
    .filter((n): n is string => Boolean(n))
    .map((n) => n.toLowerCase());
  // Alle Wohnungen laden, deren lowercased number im Set ist.
  // ilike-OR über alle ist unhandlich → wir laden alle Wohnungen
  // mit Building-Präfix; bei <500 Wohnungen ist das ok.
  const { data: apartmentsInDb } = await supabase
    .from('apartments')
    .select('id, number');
  const numberToId = new Map(
    (apartmentsInDb ?? [])
      .filter((a) => apartmentNumbersLower.includes((a.number as string).toLowerCase()))
      .map((a) => [(a.number as string).toLowerCase(), a.id as string]),
  );

  // Existierende Buchungen, die schon aus Flatfox importiert wurden
  const externalRefs = filtered.map((a) => `flatfox:${a.pk}`);
  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('id, external_reference')
    .in('external_reference', externalRefs);
  const refToBookingId = new Map(
    (existingBookings ?? []).map((b) => [b.external_reference, b.id] as [string, string]),
  );

  const rows: FlatfoxAppRow[] = filtered.map((a) => {
    const listing = listings.get(a.flat);
    const apartmentNumber = listing ? listingToApartmentNumber(listing) : null;
    const inDbId = apartmentNumber ? numberToId.get(apartmentNumber.toLowerCase()) ?? null : null;
    const importedId = refToBookingId.get(`flatfox:${a.pk}`) ?? null;

    return {
      pk: a.pk,
      first_name: a.first_name,
      last_name: a.last_name,
      email: a.email,
      phone_number: a.phone_number,
      created: a.created,
      form_submitted: a.form_submitted,
      has_form_data: a.has_form_data,
      status: a.status,
      flat_id: a.flat,
      apartment_number: apartmentNumber,
      apartment_label: listing ? listing.public_address : null,
      apartment_in_db_id: inDbId,
      rent_gross: listing?.rent_gross ?? null,
      is_imported: Boolean(importedId),
      imported_booking_id: importedId,
    };
  });

  return { ok: true, rows };
}

/* -------------------------------------------------- *
 *  WOHNUNGEN für manuelle Zuordnung                   *
 * -------------------------------------------------- */
export interface ApartmentLookup {
  id: string;
  number: string;
  building: string | null;
  type: string | null;
}

export async function listApartmentsForFlatfoxAssign(): Promise<{
  ok: boolean;
  error?: string;
  rows?: ApartmentLookup[];
}> {
  await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('apartments')
    .select('id, number, building, type')
    .order('number');
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    rows: (data ?? []).map((a) => ({
      id: a.id as string,
      number: a.number as string,
      building: (a.building as string) ?? null,
      type: (a.type as string) ?? null,
    })),
  };
}

/* -------------------------------------------------- *
 *  ÜBERNEHMEN                                         *
 * -------------------------------------------------- */
export interface ImportFlatfoxResult {
  ok: boolean;
  error?: string;
  bookingId?: string;
  documentsStored?: number;
}

export interface ImportFlatfoxOptions {
  /** Einzug, ISO YYYY-MM-DD. Wenn leer, nehmen wir heute. */
  startDate?: string;
  /** Auszug, ISO. Leer = unbefristet (9999-12-31). */
  endDate?: string;
  rentAmount?: number;
  depositAmount?: number;
  contractStatus?: 'draft' | 'sent' | 'signed';
  bookingStatus?: 'planned' | 'active';
  /**
   * Wohnungs-ID manuell überschreiben (für Anmeldungen, bei denen die
   * Flatfox-Referenz fehlt oder nicht gemappt werden kann).
   */
  apartmentIdOverride?: string;
}

export async function importFlatfoxApplication(
  applicationPk: number,
  options: ImportFlatfoxOptions = {},
): Promise<ImportFlatfoxResult> {
  await requireRole(['admin', 'office']);

  const appRes = await getApplication(applicationPk);
  if (!appRes.ok || !appRes.data) return { ok: false, error: appRes.error ?? 'Application nicht abrufbar' };
  const app = appRes.data;

  const supabase = createSupabaseServerClient();

  // Wohnung bestimmen: entweder manuell überschrieben, oder via Listing
  let apartment: { id: string; number: string; standard_rent: number | null } | null = null;
  let listing: FlatfoxListing | null = null;

  if (options.apartmentIdOverride) {
    const { data: a } = await supabase
      .from('apartments')
      .select('id, number, standard_rent')
      .eq('id', options.apartmentIdOverride)
      .maybeSingle();
    if (!a) {
      return { ok: false, error: 'Manuell gewählte Wohnung wurde nicht gefunden.' };
    }
    apartment = a as { id: string; number: string; standard_rent: number | null };
    // Listing trotzdem versuchen zu laden (für rent_gross etc.)
    const lr = await getListing(app.flat);
    listing = lr.ok && lr.data ? lr.data : null;
  } else {
    const listingRes = await getListing(app.flat);
    if (!listingRes.ok || !listingRes.data) {
      return { ok: false, error: `Listing ${app.flat} nicht abrufbar (${listingRes.error})` };
    }
    listing = listingRes.data;
    const apartmentNumber = listingToApartmentNumber(listing);
    if (!apartmentNumber) {
      return {
        ok: false,
        error: 'Listing hat keine Wohnungs-Referenz (ref_house/ref_object). Bitte manuell zuordnen.',
      };
    }
    // Case-insensitive Matching: 'c.0406' soll 'C.0406' finden
    const { data: a } = await supabase
      .from('apartments')
      .select('id, number, standard_rent')
      .ilike('number', apartmentNumber)
      .maybeSingle();
    if (!a) {
      return {
        ok: false,
        error: `Wohnung ${apartmentNumber} ist nicht in der DB. Bitte zuerst importieren oder manuell zuordnen.`,
      };
    }
    apartment = a as { id: string; number: string; standard_rent: number | null };
  }
  const apartmentNumber = apartment.number;

  // Schon importiert?
  const externalRef = `flatfox:${app.pk}`;
  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('external_reference', externalRef)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: 'Diese Anmeldung wurde bereits übernommen.', bookingId: existing.id };
  }

  // Mieter anlegen oder über E-Mail finden
  let tenantId: string | null = null;
  if (app.email) {
    const { data: existingT } = await supabase
      .from('tenants')
      .select('id')
      .eq('email', app.email)
      .maybeSingle();
    if (existingT) tenantId = existingT.id;
  }
  if (!tenantId) {
    const { data: created, error } = await supabase
      .from('tenants')
      .insert({
        tenant_kind: 'tenant',
        first_name: app.first_name,
        last_name: app.last_name,
        email: app.email,
        phone: app.phone_number,
        source: 'flatfox',
        flatfox_raw: app as unknown as Record<string, unknown>,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: `Mieter konnte nicht angelegt werden: ${error.message}` };
    tenantId = created.id;
  }

  // Channel-ID für Flatfox holen
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('code', 'flatfox')
    .maybeSingle();

  // Werte aus Optionen oder sinnvolle Defaults
  const today = new Date().toISOString().slice(0, 10);
  const startDate = options.startDate || today;
  const endDate = options.endDate || '9999-12-31';
  const rentAmount = options.rentAmount ?? listing?.rent_gross ?? apartment.standard_rent ?? 0;
  const depositAmount = options.depositAmount ?? 0;
  const contractStatus = options.contractStatus ?? 'draft';
  const bookingStatus = options.bookingStatus ?? 'planned';

  // Verfügbarkeit prüfen
  const av = await checkAvailability({
    apartmentId: apartment.id,
    startDate,
    endDate,
  });
  if (!av.available) {
    return {
      ok: false,
      error: `Wohnung ${apartmentNumber} ist im Zeitraum nicht frei: ${av.conflicts.map((c) => c.label).join(', ')}`,
    };
  }

  // Buchung
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      apartment_id: apartment.id,
      tenant_id: tenantId,
      rental_type: 'long_term',
      channel_id: channel?.id ?? null,
      external_reference: externalRef,
      start_date: startDate,
      end_date: endDate,
      rent_amount: rentAmount,
      deposit_amount: depositAmount,
      contract_status: contractStatus,
      status: bookingStatus,
      notes: `Aus Flatfox übernommen am ${new Date().toLocaleDateString('de-CH')}.\nFlatfox-PK: ${app.pk}\nFlatfox-User: ${app.user}${app.text ? `\n\nText:\n${app.text}` : ''}`,
    })
    .select('id')
    .single();
  if (bookingErr) return { ok: false, error: `Buchung konnte nicht angelegt werden: ${bookingErr.message}` };

  // Hauptmieter als occupant eintragen
  await supabase.from('booking_occupants').insert({
    booking_id: booking.id,
    tenant_id: tenantId,
    role: 'main_tenant',
    is_main_tenant: true,
  });

  // Anhänge: PDF + ZIP herunterladen, in Storage speichern
  let docsStored = 0;
  for (const att of [
    { url: app.summary_pdf_url, defaultName: `flatfox-${app.pk}.pdf`, type: 'flatfox_application' as const, mime: 'application/pdf' },
    { url: app.summary_zip_url, defaultName: `flatfox-${app.pk}.zip`, type: 'other' as const, mime: 'application/zip' },
  ]) {
    if (!att.url) continue;
    const dl = await downloadAttachment(att.url);
    if (!dl.ok || !dl.data) continue;
    const filename = dl.data.filename ?? att.defaultName;
    const path = `flatfox/${booking.id}/${filename}`;
    const { error: upErr } = await supabase.storage
      .from('tenant-documents')
      .upload(path, dl.data.buffer, { contentType: dl.data.mimeType ?? att.mime, upsert: true });
    if (upErr) continue;
    await supabase.from('tenant_documents').insert({
      tenant_id: tenantId,
      booking_id: booking.id,
      type: att.type,
      filename,
      storage_path: path,
      mime_type: dl.data.mimeType ?? att.mime,
      size_bytes: dl.data.buffer.byteLength,
    });
    docsStored++;
  }

  // Workflow-Aufgaben (Langzeit Einzug + Auszug) instanziieren
  await instantiateBookingTasks(supabase, booking.id);

  revalidatePath('/bookings');
  revalidatePath('/bookings/flatfox');
  revalidatePath(`/apartments/${apartment.id}`);

  return { ok: true, bookingId: booking.id, documentsStored: docsStored };
}
