import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import PendingReservationsList from './pending-list';

export const metadata = { title: 'Offene Booking-Reservationen · TP-Command' };

export default async function PendingPage() {
  await requireRole(['admin', 'office']);

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('pending_reservations')
    .select('id, start_date, end_date, summary, status, channel:channels(code, display_name)')
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
        description="Reservationen, die über den Booking-Pool eingegangen sind und noch keiner Wohnung zugewiesen wurden."
      />

      <PendingReservationsList
        rows={(data ?? []).map((r) => ({
          id: r.id,
          start_date: r.start_date,
          end_date: r.end_date,
          summary: r.summary,
          status: r.status,
          channel_code: (r.channel as { code: string } | null)?.code ?? '–',
          channel_label:
            (r.channel as { display_name: string } | null)?.display_name ?? '–',
        }))}
      />
    </div>
  );
}
