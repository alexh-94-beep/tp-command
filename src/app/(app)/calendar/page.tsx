import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCalendarData } from '@/services/calendar/grid';
import { addDaysIso, todayIso } from '@/lib/dates';
import CalendarGrid from './calendar-grid';
import CalendarToolbar from './calendar-toolbar';

export const metadata = { title: 'Belegung' };

const DEFAULT_DAYS = 30;

interface SearchParams {
  start?: string;
  days?: string;
  building?: string;
  type?: string;
  rental_type?: string;
  showSold?: string;
}

function clampStart(start: string | undefined): string {
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return todayIso();
  return start;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();
  const sp = await searchParams;

  const start = clampStart(sp.start);
  const days = Math.max(7, Math.min(120, Number(sp.days ?? DEFAULT_DAYS) || DEFAULT_DAYS));
  const end = addDaysIso(start, days);

  const csv = (s: string | undefined) => (s ?? '').split(',').filter(Boolean);
  const types = csv(sp.type).filter((v): v is 'junior' | 'senior' | 'suite' | 'studio' =>
    ['junior', 'senior', 'suite', 'studio'].includes(v),
  );
  const rentalTypes = csv(sp.rental_type).filter(
    (v): v is 'long_term' | 'short_term' | 'booking' =>
      ['long_term', 'short_term', 'booking'].includes(v),
  );

  const supabase = await createSupabaseServerClient();
  const data = await getCalendarData(supabase, {
    startDate: start,
    endDate: end,
    buildings: csv(sp.building),
    types,
    rentalTypes,
    includeSoldExternal: sp.showSold === '1',
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Belegungsplanung"
        description={`${days} Tage ab ${start}. Klick auf einen Balken öffnet die Buchung.`}
      />

      <CalendarToolbar start={start} days={days} />

      <CalendarGrid
        startDate={start}
        endDate={end}
        apartments={data.apartments}
        events={data.events}
      />
    </div>
  );
}
