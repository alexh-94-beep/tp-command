import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import ChannelLinksTable from './channel-links-table';
import ChannelPoolConfig from './channel-pool-config';

export const metadata = { title: 'Channels & iCal · TP-Command' };

export default async function ChannelSettingsPage() {
  await requireRole(['admin', 'office']);

  const supabase = createSupabaseServerClient();

  const [{ data: apartments }, { data: channels }, { data: links }] = await Promise.all([
    supabase
      .from('apartments')
      .select('id, number, building, type, allowed_rental_types, ownership')
      .neq('ownership', 'sold_external')
      .order('number'),
    supabase
      .from('channels')
      .select('id, code, display_name, is_active, config')
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('apartment_channel_links')
      .select('apartment_id, channel_id, ical_pull_url, external_id'),
  ]);

  const icalChannels = (channels ?? []).filter((c) =>
    ['booking_com', 'airbnb', 'expedia'].includes(c.code),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Channels & iCal"
        description="Pro Wohnung kannst du iCal-URLs für Booking.com, Airbnb und Expedia hinterlegen. Wir ziehen die Belegung von dort und erstellen automatisch Buchungen."
      />

      <ChannelPoolConfig
        channels={(icalChannels as { id: string; code: string; display_name: string; config: Record<string, unknown> | null }[])}
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Direkt-Modus (1 iCal pro Wohnung)</p>
        <p className="mt-1 text-xs">
          Nur nutzen, wenn pro Wohnung ein eigenes Inserat existiert (z. B. Airbnb).
          Für Booking.com mit Pool-Inserat: oben die Pool-URL eintragen.
        </p>
      </div>

      <ChannelLinksTable
        apartments={(apartments ?? []) as { id: string; number: string; building: string; type: string; allowed_rental_types: string[] }[]}
        channels={icalChannels as { id: string; code: string; display_name: string }[]}
        links={(links ?? []) as { apartment_id: string; channel_id: string; ical_pull_url: string | null; external_id: string | null }[]}
      />
    </div>
  );
}
