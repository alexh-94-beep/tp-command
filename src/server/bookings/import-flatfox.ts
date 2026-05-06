'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { parseFlatfoxPdf, type FlatfoxApplication } from '@/services/import/flatfox';
import { checkAvailability } from '@/services/availability/check';
import { instantiateBookingTasks } from '@/services/workflow/instantiate';

export interface FlatfoxPreviewResult {
  ok: boolean;
  error?: string;
  parsed?: FlatfoxApplication;
  matchedApartmentId?: string | null;
  apartmentNumberFound?: string | null;
  availability?: {
    available: boolean;
    conflicts: Array<{ label: string; start_date: string; end_date: string }>;
  };
}

export interface FlatfoxCommitInput {
  apartmentId: string;
  startDate: string;          // YYYY-MM-DD
  endDate?: string;           // YYYY-MM-DD oder leer = unbefristet
  rentAmount: number;
  depositAmount: number;
  contractStatus: 'draft' | 'sent' | 'signed';
  bookingStatus: 'planned' | 'active';
  notes?: string;
  parsed: FlatfoxApplication; // wird wieder durchgereicht (vom Wizard cache-d)
  pdfBase64?: string;         // optional: PDF als Anhang speichern
  pdfFilename?: string;
}

export interface FlatfoxCommitResult {
  ok: boolean;
  error?: string;
  bookingId?: string;
  tenantsCreated?: number;
  documentsStored?: number;
}

/* -------------------------------------------------- *
 *  PREVIEW                                            *
 * -------------------------------------------------- */
export async function previewFlatfoxApplication(formData: FormData): Promise<FlatfoxPreviewResult> {
  await requireRole(['admin', 'office']);

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Keine Datei hochgeladen.' };

  let parsed: FlatfoxApplication;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = await parseFlatfoxPdf(buf);
  } catch (e) {
    return { ok: false, error: `PDF konnte nicht gelesen werden: ${(e as Error).message}` };
  }

  // Wohnung matchen
  const supabase = createSupabaseServerClient();
  let matchedId: string | null = null;
  if (parsed.apartment_reference) {
    const { data } = await supabase
      .from('apartments')
      .select('id')
      .eq('number', parsed.apartment_reference)
      .maybeSingle();
    matchedId = data?.id ?? null;
  }

  // Verfügbarkeit prüfen, wenn Wohnung + Datum vorhanden
  let availability;
  if (matchedId && parsed.desired_move_in) {
    const r = await checkAvailability({
      apartmentId: matchedId,
      startDate: parsed.desired_move_in,
      endDate: '9999-12-31',
    });
    availability = {
      available: r.available,
      conflicts: r.conflicts.map((c) => ({
        label: c.label,
        start_date: c.start_date,
        end_date: c.end_date,
      })),
    };
  }

  return {
    ok: true,
    parsed,
    matchedApartmentId: matchedId,
    apartmentNumberFound: parsed.apartment_reference,
    availability,
  };
}

/* -------------------------------------------------- *
 *  COMMIT                                             *
 * -------------------------------------------------- */
export async function commitFlatfoxApplication(
  input: FlatfoxCommitInput,
): Promise<FlatfoxCommitResult> {
  await requireRole(['admin', 'office']);

  const supabase = createSupabaseServerClient();
  const { parsed, apartmentId, startDate, endDate } = input;

  // 1) Verfügbarkeit nochmal prüfen (Race-Schutz)
  const av = await checkAvailability({
    apartmentId,
    startDate,
    endDate: endDate || '9999-12-31',
  });
  if (!av.available) {
    return {
      ok: false,
      error: `Wohnung nicht mehr frei: ${av.conflicts.map((c) => c.label).join(', ')}`,
    };
  }

  // 2) Tenants anlegen oder matchen (per E-Mail).
  const tenantIds: string[] = [];
  let mainTenantId: string | null = null;

  for (const [idx, app] of parsed.applicants.entries()) {
    let tenantId: string | null = null;

    if (app.email) {
      const { data: existing } = await supabase
        .from('tenants')
        .select('id')
        .eq('email', app.email)
        .maybeSingle();
      if (existing) tenantId = existing.id;
    }

    if (!tenantId) {
      const { data: created, error } = await supabase
        .from('tenants')
        .insert({
          tenant_kind: 'tenant',
          first_name: app.first_name || '(unbekannt)',
          last_name: app.last_name || '(unbekannt)',
          email: app.email,
          phone: app.phone,
          address: app.address,
          nationality: app.nationality,
          date_of_birth: app.date_of_birth,
          source: 'flatfox',
          civil_status: app.civil_status,
          gender: app.gender,
          residence_permit: app.residence_permit,
          heimatort: app.heimatort,
          profession: app.profession,
          employer: app.employer,
          employment_status: app.employment_status,
          annual_income: app.annual_income,
          has_debt_collection: app.has_debt_collection,
          previous_landlord: app.previous_landlord,
          previous_landlord_phone: app.previous_landlord_phone,
          previous_landlord_email: app.previous_landlord_email,
          flatfox_raw: app.raw,
        })
        .select('id')
        .single();
      if (error) return { ok: false, error: `Mieter konnte nicht angelegt werden: ${error.message}` };
      tenantId = created.id;
    }

    tenantIds.push(tenantId);
    if (idx === 0) mainTenantId = tenantId;
  }

  if (!mainTenantId) return { ok: false, error: 'Kein Hauptmieter im Formular erkannt.' };

  // 3) Buchung anlegen
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      apartment_id: apartmentId,
      tenant_id: mainTenantId,
      rental_type: 'long_term',
      start_date: startDate,
      end_date: endDate || '9999-12-31',
      rent_amount: input.rentAmount,
      deposit_amount: input.depositAmount,
      contract_status: input.contractStatus,
      status: input.bookingStatus,
      notes:
        (input.notes ?? '') +
        (parsed.remarks ? `\n\n[Bemerkung Flatfox] ${parsed.remarks}` : ''),
    })
    .select('id')
    .single();
  if (bookingErr) return { ok: false, error: `Buchung konnte nicht angelegt werden: ${bookingErr.message}` };

  // 4) Mitbewohner verknüpfen
  for (const [idx, tid] of tenantIds.entries()) {
    const role =
      idx === 0
        ? 'main_tenant'
        : mapRelationship(parsed.applicants[idx]?.relationship ?? null);
    await supabase.from('booking_occupants').insert({
      booking_id: booking.id,
      tenant_id: tid,
      role,
      is_main_tenant: idx === 0,
    });
  }

  // 5) PDF als Anhang speichern (optional)
  let docsStored = 0;
  if (input.pdfBase64 && input.pdfFilename) {
    try {
      const buf = Buffer.from(input.pdfBase64, 'base64');
      const path = `applications/${booking.id}/${input.pdfFilename}`;
      const { error: upErr } = await supabase.storage
        .from('tenant-documents')
        .upload(path, buf, { contentType: 'application/pdf', upsert: true });
      if (!upErr) {
        await supabase.from('tenant_documents').insert({
          tenant_id: mainTenantId,
          booking_id: booking.id,
          type: 'flatfox_application',
          filename: input.pdfFilename,
          storage_path: path,
          mime_type: 'application/pdf',
          size_bytes: buf.byteLength,
        });
        docsStored = 1;
      }
    } catch {
      /* Storage-Fehler ist nicht fatal */
    }
  }

  // 6) Workflow-Aufgaben instanziieren (Langzeit Einzug + Auszug)
  await instantiateBookingTasks(supabase, booking.id);

  revalidatePath('/bookings');
  revalidatePath('/dashboard');
  revalidatePath(`/apartments/${apartmentId}`);

  return {
    ok: true,
    bookingId: booking.id,
    tenantsCreated: tenantIds.length,
    documentsStored: docsStored,
  };
}

function mapRelationship(rel: string | null): 'co_tenant' | 'partner' | 'child' | 'roommate' | 'other' {
  if (!rel) return 'co_tenant';
  const s = rel.toLowerCase();
  if (s.includes('partner') || s.includes('ehepartner')) return 'partner';
  if (s.includes('kind')) return 'child';
  if (s.includes('mitbewohner')) return 'roommate';
  return 'other';
}
