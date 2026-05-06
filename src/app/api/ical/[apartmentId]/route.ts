import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { buildICal } from '@/lib/channels/booking/ical';

export const dynamic = 'force-dynamic';

/**
 * Public iCal-Feed für eine Wohnung. URL kann in Booking.com / Airbnb / Expedia
 * als externer Kalender hinterlegt werden, damit unsere Belegung dort als
 * "blockiert" erscheint.
 */
export async function GET(
  _request: Request,
  { params }: { params: { apartmentId: string } },
) {
  const supabase = createSupabaseServiceClient();
  const { data: apartment } = await supabase
    .from('apartments')
    .select('id, number')
    .eq('id', params.apartmentId)
    .maybeSingle();
  if (!apartment) return new NextResponse('Not found', { status: 404 });

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, start_date, end_date, status, rental_type')
    .eq('apartment_id', apartment.id)
    .in('status', ['planned', 'active']);

  const { data: blocks } = await supabase
    .from('blocks')
    .select('id, start_date, end_date, reason')
    .eq('apartment_id', apartment.id);

  const events = [
    ...(bookings ?? []).map((b) => ({
      uid: `booking-${b.id}@tp-command`,
      start: b.start_date,
      end: b.end_date === '9999-12-31' ? addYears(b.start_date, 5) : b.end_date,
      summary: 'Reserved',
      description: `TP-Command ${b.rental_type}`,
    })),
    ...(blocks ?? []).map((bl) => ({
      uid: `block-${bl.id}@tp-command`,
      start: bl.start_date,
      end: bl.end_date,
      summary: 'Blocked',
      description: bl.reason ?? '',
    })),
  ];

  const body = buildICal({ prodId: `TP-Command/${apartment.number}`, events });

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
      'Content-Disposition': `attachment; filename="${apartment.number}.ics"`,
    },
  });
}

function addYears(iso: string, years: number): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}
