import Link from 'next/link';
import { ArrowLeft, Home, Clock, Globe } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import NewBookingForm from './new-booking-form';
import type { RentalType } from '@/types/aliases';

export const metadata = { title: 'Neue Buchung' };

interface SearchParams {
  apartment?: string;
  type?: string;
}

const VALID_TYPES: RentalType[] = ['long_term', 'short_term'];

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(['admin', 'office']);
  const { apartment, type } = await searchParams;

  // Phase 25a: Erst Typ-Wahl-Schritt, dann typ-spezifische Maske
  const selectedType: RentalType | null =
    type && (VALID_TYPES as string[]).includes(type) ? (type as RentalType) : null;

  if (!selectedType) {
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
          description="Welcher Typ Buchung soll erfasst werden?"
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            href={{
              pathname: '/bookings/new',
              query: apartment ? { type: 'long_term', apartment } : { type: 'long_term' },
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-900 hover:shadow"
          >
            <div className="flex items-start gap-3">
              <Home className="mt-1 h-6 w-6 text-slate-700" />
              <div>
                <h2 className="text-base font-medium">Langzeitmiete</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Ab 6 Monate Mindestmietdauer. Vertrag über W&amp;W, signiert via
                  Flatfox. Mietzins, Depot, Stadt-/Strom-Anmeldung.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href={{
              pathname: '/bookings/new',
              query: apartment ? { type: 'short_term', apartment } : { type: 'short_term' },
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-900 hover:shadow"
          >
            <div className="flex items-start gap-3">
              <Clock className="mt-1 h-6 w-6 text-slate-700" />
              <div>
                <h2 className="text-base font-medium">Kurzzeitmiete</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Unter 6 Monate. Telefon / Mail / WhatsApp-Anfrage.
                  Wahlweise via W&amp;W oder direkt mit Offerte abgerechnet.
                </p>
              </div>
            </div>
          </Link>

          <div
            aria-disabled
            className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6"
          >
            <div className="flex items-start gap-3">
              <Globe className="mt-1 h-6 w-6 text-slate-400" />
              <div>
                <h2 className="text-base font-medium text-slate-500">
                  Booking.com
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Booking-Buchungen werden automatisch aus Booking-Mails
                  erzeugt und über{' '}
                  <Link
                    href={{ pathname: '/bookings/pending' }}
                    className="underline"
                  >
                    Pool-Reservationen
                  </Link>{' '}
                  Wohnungen zugewiesen — nicht manuell hier.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: channels } = await supabase
    .from('channels')
    .select('id, code, display_name')
    .eq('is_active', true)
    .order('display_name');

  const headerByType: Record<'long_term' | 'short_term', { title: string; desc: string }> = {
    long_term: {
      title: 'Neue Langzeitmiete',
      desc: 'Mindestens 6 Monate. Mietzins, Depot, Vertragsstatus pflegen.',
    },
    short_term: {
      title: 'Neue Kurzzeitmiete',
      desc: 'Unter 6 Monate. Abrechnung wahlweise via W&W oder direkt mit Offerte.',
    },
  };
  const header = headerByType[selectedType as 'long_term' | 'short_term'];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={{ pathname: '/bookings/new' }}
          className="text-slate-500 hover:text-slate-700"
        >
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Typ ändern
          </span>
        </Link>
      </div>

      <PageHeader title={header.title} description={header.desc} />

      <NewBookingForm
        channels={channels ?? []}
        defaultApartmentId={apartment}
        rentalType={selectedType}
      />
    </div>
  );
}
