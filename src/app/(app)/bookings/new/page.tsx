import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import NewBookingForm from './new-booking-form';

export const metadata = { title: 'Neue Buchung · TP-Command' };

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: { apartment?: string };
}) {
  await requireRole(['admin', 'office']);

  const supabase = createSupabaseServerClient();

  const { data: channels } = await supabase
    .from('channels')
    .select('id, code, display_name')
    .eq('is_active', true)
    .order('display_name');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/bookings" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Buchungsliste
          </span>
        </Link>
      </div>

      <PageHeader
        title="Neue Buchung"
        description="Erst Datum eingeben, dann werden nur die für den Zeitraum verfügbaren Wohnungen angeboten. Auszug leer lassen für unbefristete Langzeitmiete."
      />

      <NewBookingForm
        channels={(channels ?? []) as { id: string; code: string; display_name: string }[]}
        defaultApartmentId={searchParams.apartment}
      />
    </div>
  );
}
