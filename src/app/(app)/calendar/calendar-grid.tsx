import Link from 'next/link';
import type { Route } from 'next';
import { dayDiff, daysBetween } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { CalendarApartment, CalendarEvent } from '@/services/calendar/grid';

interface Props {
  startDate: string;
  endDate: string;
  apartments: CalendarApartment[];
  events: CalendarEvent[];
}

const APARTMENT_COL = 110;
const DAY_WIDTH = 28;
const ROW_HEIGHT = 32;

const DAY_LABELS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function eventStyle(e: CalendarEvent): { bg: string; text: string; border: string } {
  if (e.kind === 'block')
    return { bg: 'bg-red-200', text: 'text-red-900', border: 'border-red-400' };
  if (e.kind === 'mirror')
    return { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-300' };
  if (e.rental_type === 'booking')
    return { bg: 'bg-purple-200', text: 'text-purple-900', border: 'border-purple-400' };
  if (e.rental_type === 'short_term')
    return { bg: 'bg-sky-200', text: 'text-sky-900', border: 'border-sky-400' };
  return { bg: 'bg-emerald-200', text: 'text-emerald-900', border: 'border-emerald-400' };
}

type PlacedEvent = CalendarEvent & { _offset: number; _span: number };

export default function CalendarGrid({ startDate, endDate, apartments, events }: Props) {
  const days = daysBetween(startDate, endDate);
  const totalDays = days.length;
  const gridWidth = APARTMENT_COL + totalDays * DAY_WIDTH;

  const byApt = new Map<string, PlacedEvent[]>();
  for (const e of events) {
    const startClamped = e.start_date < startDate ? startDate : e.start_date;
    const endClamped = e.end_date > endDate ? endDate : e.end_date;
    if (endClamped <= startClamped) continue;
    const offset = dayDiff(startDate, startClamped);
    const span = Math.max(1, dayDiff(startClamped, endClamped));
    const arr = byApt.get(e.apartment_id) ?? [];
    arr.push({ ...e, start_date: startClamped, end_date: endClamped, _offset: offset, _span: span });
    byApt.set(e.apartment_id, arr);
  }

  const todayIdx = days.findIndex((d) => d === new Date().toISOString().slice(0, 10));

  const monthSpans: Array<{ label: string; days: number }> = [];
  for (const d of days) {
    const month = new Date(d).toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.label === month) last.days += 1;
    else monthSpans.push({ label: month, days: 1 });
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
      <div style={{ width: gridWidth }}>
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-700">
          <div
            style={{ width: APARTMENT_COL }}
            className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-2 py-2"
          >
            Wohnung
          </div>
          {monthSpans.map((m, i) => (
            <div
              key={i}
              style={{ width: m.days * DAY_WIDTH }}
              className="border-r border-slate-200 px-2 py-2"
            >
              {m.label}
            </div>
          ))}
        </div>

        <div className="flex border-b border-slate-200 bg-slate-50 text-[10px] text-slate-600">
          <div
            style={{ width: APARTMENT_COL }}
            className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50"
          />
          {days.map((d, i) => {
            const date = new Date(d);
            const dow = date.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isToday = i === todayIdx;
            return (
              <div
                key={d}
                style={{ width: DAY_WIDTH }}
                className={cn(
                  'flex flex-col items-center justify-center border-r border-slate-100 py-1',
                  isWeekend && 'bg-slate-100/60',
                  isToday && 'bg-amber-50 font-semibold text-amber-700',
                )}
              >
                <span>{DAY_LABELS_DE[dow]}</span>
                <span>{date.getDate()}</span>
              </div>
            );
          })}
        </div>

        {apartments.map((a) => {
          const aptEvents = byApt.get(a.id) ?? [];
          return (
            <div
              key={a.id}
              className="relative flex border-b border-slate-100 hover:bg-slate-50/60"
              style={{ height: ROW_HEIGHT }}
            >
              <Link
                href={`/apartments/${a.id}`}
                style={{ width: APARTMENT_COL }}
                className="sticky left-0 z-10 flex items-center border-r border-slate-200 bg-white px-2 text-xs font-medium text-slate-900 hover:underline"
              >
                {a.number}
              </Link>

              <div className="relative flex">
                {days.map((d, i) => {
                  const dow = new Date(d).getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  const isToday = i === todayIdx;
                  return (
                    <div
                      key={d}
                      style={{ width: DAY_WIDTH, height: ROW_HEIGHT }}
                      className={cn(
                        'border-r border-slate-100',
                        isWeekend && 'bg-slate-100/60',
                        isToday && 'bg-amber-50/60',
                      )}
                    />
                  );
                })}

                {aptEvents.map((e) => {
                  const style = eventStyle(e);
                  const content = (
                    <div
                      style={{
                        left: e._offset * DAY_WIDTH + 1,
                        width: e._span * DAY_WIDTH - 2,
                        top: 4,
                        height: ROW_HEIGHT - 8,
                      }}
                      className={cn(
                        'absolute flex items-center overflow-hidden rounded border px-1.5 text-[11px] font-medium',
                        style.bg,
                        style.text,
                        style.border,
                      )}
                      title={`${e.title} (${e.start_date} – ${e.end_date})`}
                    >
                      <span className="truncate">{e.title}</span>
                    </div>
                  );
                  return e.href ? (
                    <Link key={`${e.id}-${e._offset}`} href={e.href as Route}>
                      {content}
                    </Link>
                  ) : (
                    <div key={`${e.id}-${e._offset}`}>{content}</div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <LegendDot className="bg-emerald-200 border-emerald-400" label="Langzeit-Buchung" />
        <LegendDot className="bg-sky-200 border-sky-400" label="Kurzzeit-Buchung" />
        <LegendDot className="bg-purple-200 border-purple-400" label="Booking" />
        <LegendDot className="bg-amber-100 border-amber-300" label="aus Excel-Spiegel" />
        <LegendDot className="bg-red-200 border-red-400" label="Sperre" />
        <span className="ml-auto">
          {apartments.length} Wohnungen · {events.length} Einträge im Zeitraum
        </span>
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block h-3 w-5 rounded border', className)} />
      {label}
    </span>
  );
}
