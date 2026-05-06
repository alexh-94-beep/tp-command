import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import { getCalendarData } from '@/services/calendar/grid';
import { addDaysIso, todayIso } from '@/lib/dates';
import CalendarGrid from './calendar-grid';
import CalendarToolbar from './calendar-toolbar';

export const metadata = { title: 'Belegung · TP-Command' };

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
  searchParams: SearchParams;
}) {
  await requireUser();

  const start = clampStart(searchParams.start);
  const days = Math.max(7, Math.min(120, Number(searchParams.days ?? DEFAULT_DAYS) || DEFAULT_DAYS));
  const end = addDaysIso(start, days);

  const data = await getCalendarData({
    startDate: start,
    endDate: end,
    building: searchParams.building || undefined,
    type: searchParams.type || undefined,
    rentalType:
      searchParams.rental_type === 'long_term' ||
      searchParams.rental_type === 'short_term' ||
      searchParams.rental_type === 'booking'
        ? searchParams.rental_type
        : undefined,
    includeSoldExternal: searchParams.showSold === '1',
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
