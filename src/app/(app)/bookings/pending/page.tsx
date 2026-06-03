import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import PendingReservationsList from './pending-list';

export const metadata = { title: 'Pool-Reservationen' };

export default async function PendingPage() {
  await requireRole(['admin', 'office']);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('pending_reservations')
    .select(
      'id, external_uid, start_date, end_date, summary, status, guest_count, channel:channels(code, display_name)',
    )
    .eq('status', 'pending')
    .order('start_date');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/bookings" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zu Buchungen
          </span>
        </Link>
      </div>

      <PageHeader
        title="Offene Pool-Reservationen"
        description="Reservationen aus dem Booking-Pool, die noch keiner Wohnung zugewiesen wurden. Manuell eingegeben, sobald eine Mail von Booking.com eingeht."
        actions={
          <Link href="/bookings/pending/new">
            <Button>
              <Plus className="h-4 w-4" />
              Neue Pool-Reservation
            </Button>
          </Link>
        }
      />

      <PendingReservationsList
        rows={(data ?? []).map((r) => ({
          id: r.id,
          external_uid: r.external_uid,
          start_date: r.start_date,
          end_date: r.end_date,
          summary: r.summary,
          guest_count: r.guest_count,
          channel_code: r.channel?.code ?? '–',
          channel_label: r.channel?.display_name ?? '–',
        }))}
      />
    </div>
  );
}
