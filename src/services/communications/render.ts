/**
 * Render-Service: laedt Buchungs-Daten und fuettert die Templates damit.
 *
 * Pure Helper `buildContextFromBooking` ist testbar. Der DB-Orchestrator
 * `renderForBooking` liefert {subject, body} fuer eine konkrete Buchung
 * + Template-Key.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import type { CommunicationType } from '@/types/aliases';
import { renderTemplate, type RenderedTemplate, type TemplateContext } from './templates';

export interface BookingForRender {
  start_date: string;
  end_date: string;
  rent_amount: number;
  deposit_amount: number;
  rental_type: 'long_term' | 'short_term' | 'booking';
  apartment: {
    number: string;
    building: string;
  } | null;
  tenant: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

export interface ContextExtras {
  wifiSsid?: string;
  wifiPassword?: string;
  keyBoxCode?: string;
  paymentDueDate?: string;
  paymentAmount?: number;
  paymentReference?: string;
}

export function buildContextFromBooking(
  b: BookingForRender,
  extras: ContextExtras = {},
): TemplateContext {
  return {
    guestFirstName: b.tenant?.first_name ?? 'Gast',
    guestLastName: b.tenant?.last_name ?? '',
    apartmentNumber: b.apartment?.number ?? '–',
    apartmentBuilding: b.apartment?.building ?? '–',
    startDate: b.start_date,
    endDate: b.end_date,
    rentAmount: Number(b.rent_amount),
    depositAmount: Number(b.deposit_amount),
    rentalType: b.rental_type,
    ...extras,
  };
}

export interface RenderResult extends RenderedTemplate {
  recipient: string;
}

export async function renderForBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  templateKey: CommunicationType,
  extras: ContextExtras = {},
): Promise<RenderResult | { error: string }> {
  const { data: b } = await supabase
    .from('bookings')
    .select(
      'start_date, end_date, rent_amount, deposit_amount, rental_type, apartment:apartments(number, building), tenant:tenants!bookings_tenant_id_fkey(first_name, last_name, email)',
    )
    .eq('id', bookingId)
    .single();
  if (!b) return { error: 'Buchung nicht gefunden' };

  const tenantEmail = b.tenant?.email;
  if (!tenantEmail) {
    return {
      error:
        'Mieter / Gast hat keine E-Mail-Adresse hinterlegt. Bitte zuerst im Tenant-Profil eintragen.',
    };
  }

  const ctx = buildContextFromBooking(
    {
      start_date: b.start_date,
      end_date: b.end_date,
      rent_amount: Number(b.rent_amount),
      deposit_amount: Number(b.deposit_amount),
      rental_type: b.rental_type,
      apartment: b.apartment,
      tenant: b.tenant,
    },
    extras,
  );

  const rendered = renderTemplate(templateKey, ctx);
  return { ...rendered, recipient: tenantEmail };
}
