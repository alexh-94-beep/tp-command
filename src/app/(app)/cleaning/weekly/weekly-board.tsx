'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { FileDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { applySpeedFactor } from '@/services/cleaning/duration';
import { moveCleaningTask } from '@/server/cleaning/staff';
import type { CleaningStatus, CleaningType } from '@/types/aliases';

const TYPE_LABELS: Record<CleaningType, string> = {
  checkout: 'Auszug',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Wiederkehrend',
  weekly_clean: 'Wöchentlich',
  weekly_clean_linen: 'Wöchentlich + Bett',
  biweekly_clean: 'Zweiwöchentlich',
  biweekly_clean_linen: 'Zweiwöchentlich + Wäsche',
  monthly_clean: 'Monatlich',
  monthly_clean_linen: 'Monatlich + Wäsche',
  inspection: 'Inspektion',
  special: 'Spezial',
  deep_clean: 'Endreinigung',
};

const STATUS_DOT: Record<CleaningStatus, string> = {
  open: 'bg-amber-400',
  in_progress: 'bg-blue-500',
  done: 'bg-emerald-500',
  quality_checked: 'bg-emerald-700',
  cancelled: 'bg-red-400',
};

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export interface WeeklyStaff {
  id: string;
  full_name: string;
  speed_factor: number;
  pensum_percent: number;
  is_lead: boolean;
  is_hourly: boolean;
  team_name: string | null;
}

export interface WeeklyTask {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  type: CleaningType;
  status: CleaningStatus;
  staff_id: string | null;
  estimated_duration_minutes: number | null;
  actual_duration_minutes: number | null;
  target: string;
  guest: string | null;
}

interface Row {
  key: string;
  name: string;
  isTeam: boolean;
  isLead: boolean;
  isHourly: boolean;
  speedFactor: number;
  memberIds: string[];
  primaryStaffId: string | null;
  pdfStaffIds: string[];
}

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes < 1) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h}:${String(m).padStart(2, '0')} h`;
}
function endTime(start: string | null, durMin: number | null): string | null {
  if (!start || !durMin) return null;
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + (m ?? 0) + durMin;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

export default function WeeklyBoard({
  weekStart,
  days,
  staff,
  initialTasks,
}: {
  weekStart: string;
  days: string[];
  staff: WeeklyStaff[];
  initialTasks: WeeklyTask[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [pending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Personen + Teams als Zeilen, plus "Nicht zugewiesen"
  const seenTeams = new Set<string>();
  const rows: Row[] = [];
  for (const s of staff) {
    if (s.team_name) {
      if (seenTeams.has(s.team_name)) continue;
      const members = staff.filter((m) => m.team_name === s.team_name);
      seenTeams.add(s.team_name);
      rows.push({
        key: `team:${s.team_name}`,
        name: s.team_name,
        isTeam: true,
        isLead: false,
        isHourly: members.some((m) => m.is_hourly),
        speedFactor: s.speed_factor,
        memberIds: members.map((m) => m.id),
        primaryStaffId: members[0].id,
        pdfStaffIds: members.map((m) => m.id),
      });
    } else {
      rows.push({
        key: `staff:${s.id}`,
        name: s.full_name,
        isTeam: false,
        isLead: s.is_lead,
        isHourly: s.is_hourly,
        speedFactor: s.speed_factor,
        memberIds: [s.id],
        primaryStaffId: s.id,
        pdfStaffIds: [s.id],
      });
    }
  }
  rows.push({
    key: 'unassigned',
    name: 'Nicht zugewiesen',
    isTeam: false,
    isLead: false,
    isHourly: false,
    speedFactor: 1,
    memberIds: [],
    primaryStaffId: null,
    pdfStaffIds: [],
  });

  const today = new Date().toISOString().slice(0, 10);
  // Verwaiste Tasks (staff_id zeigt auf inaktiven Staff) landen
  // im "Nicht zugewiesen"-Bucket statt komplett zu verschwinden.
  const knownStaffIds = new Set(staff.map((s) => s.id));

  function tasksFor(row: Row, date: string) {
    if (row.key === 'unassigned') {
      return tasks
        .filter(
          (t) =>
            t.scheduled_date === date &&
            (!t.staff_id || !knownStaffIds.has(t.staff_id)),
        )
        .sort((a, b) => (a.scheduled_time ?? '99').localeCompare(b.scheduled_time ?? '99'));
    }
    return tasks
      .filter(
        (t) => t.staff_id && row.memberIds.includes(t.staff_id) && t.scheduled_date === date,
      )
      .sort((a, b) => (a.scheduled_time ?? '99').localeCompare(b.scheduled_time ?? '99'));
  }

  function handleDrop(row: Row, date: string) {
    setDropTarget(null);
    if (!draggingId) return;
    const task = tasks.find((t) => t.id === draggingId);
    if (!task) return;
    setDraggingId(null);

    const newStaffId = row.key === 'unassigned' ? null : row.primaryStaffId;
    if (task.staff_id === newStaffId && task.scheduled_date === date) return;

    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, staff_id: newStaffId, scheduled_date: date } : t,
      ),
    );
    startTransition(async () => {
      const r = await moveCleaningTask({
        taskId: task.id,
        staffId: newStaffId,
        scheduledDate: date,
      });
      if (!r.ok) {
        setError(r.error ?? 'Verschieben fehlgeschlagen');
        setTasks(previous);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Reinigerin</th>
              {days.map((d, i) => {
                const date = new Date(d);
                const isToday = d === today;
                const isWeekend = i >= 5;
                return (
                  <th
                    key={d}
                    className={cn(
                      'border-l border-slate-200 px-3 py-2 align-bottom',
                      isWeekend && 'bg-slate-100/60',
                      isToday && 'bg-amber-50 text-amber-700',
                    )}
                  >
                    <div>{DAY_LABELS[i]}</div>
                    <div className="text-[11px] font-normal text-slate-600">
                      {date.getDate()}.{date.getMonth() + 1}.
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const dailyTotals = days.map((d) =>
                tasksFor(row, d).reduce(
                  (sum, t) =>
                    sum +
                    applySpeedFactor(t.estimated_duration_minutes ?? 60, row.speedFactor),
                  0,
                ),
              );
              const weekTotal = dailyTotals.reduce((a, b) => a + b, 0);
              return (
                <tr key={row.key} className="align-top hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 font-medium">
                    <div className="flex flex-wrap items-center gap-1">
                      {row.name}
                      {row.isTeam && <Badge tone="info">Team</Badge>}
                      {row.isLead && <Badge tone="info">Lead</Badge>}
                      {row.isHourly && <Badge tone="neutral">Stunden</Badge>}
                    </div>
                    <div className="text-[11px] font-normal text-slate-500">
                      {formatDuration(weekTotal)}
                    </div>
                    {row.pdfStaffIds.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.pdfStaffIds.map((sid) => (
                          <a
                            key={sid}
                            href={`/api/cleaning/daily-pdf?date=${weekStart}&days=7&staff_id=${sid}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Wochenplan als PDF"
                          >
                            <Button variant="secondary" size="sm">
                              <FileDown className="h-3 w-3" />
                            </Button>
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  {days.map((d, i) => {
                    const cellTasks = tasksFor(row, d);
                    const isWeekend = i >= 5;
                    const dayTotal = dailyTotals[i];
                    const cellId = `${row.key}|${d}`;
                    return (
                      <td
                        key={d}
                        className={cn(
                          'min-w-[160px] border-l border-slate-200 px-2 py-2 align-top transition',
                          isWeekend && 'bg-slate-100/40',
                          dropTarget === cellId && 'bg-blue-50 ring-1 ring-blue-300',
                        )}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dropTarget !== cellId) setDropTarget(cellId);
                        }}
                        onDragLeave={() =>
                          setDropTarget((prev) => (prev === cellId ? null : prev))
                        }
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDrop(row, d);
                        }}
                      >
                        {dayTotal > 0 && (
                          <div className="mb-1 text-right text-[10px] text-slate-500">
                            {formatDuration(dayTotal)}
                          </div>
                        )}
                        <ul className="space-y-1">
                          {cellTasks.map((t) => {
                            const personMinutes = applySpeedFactor(
                              t.estimated_duration_minutes ?? 60,
                              row.speedFactor,
                            );
                            const eTime = endTime(t.scheduled_time, personMinutes);
                            return (
                              <li key={t.id}>
                                <div
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', t.id);
                                    setDraggingId(t.id);
                                  }}
                                  onDragEnd={() => setDraggingId(null)}
                                  className={cn(
                                    'cursor-grab rounded-md bg-slate-50 px-1.5 py-1 text-xs hover:bg-slate-100 active:cursor-grabbing',
                                    draggingId === t.id && 'opacity-40',
                                  )}
                                >
                                  <Link
                                    href={`/cleaning/${t.id}`}
                                    className="flex items-start gap-1"
                                    onClick={(e) => {
                                      if (draggingId === t.id) e.preventDefault();
                                    }}
                                  >
                                    <span
                                      className={cn(
                                        'mt-1 inline-block h-2 w-2 shrink-0 rounded-full',
                                        STATUS_DOT[t.status],
                                      )}
                                    />
                                    <span className="block min-w-0 flex-1 truncate">
                                      {t.scheduled_time && (
                                        <span className="font-medium">
                                          {t.scheduled_time}
                                          {eTime ? `–${eTime}` : ''}{' '}
                                        </span>
                                      )}
                                      <span className="font-medium">{t.target}</span>
                                      <span className="text-slate-500">
                                        {' '}
                                        · {TYPE_LABELS[t.type] ?? t.type}
                                      </span>
                                      <span className="block text-[10px] text-slate-500">
                                        {formatDuration(personMinutes)}
                                        {t.guest && ` · ${t.guest}`}
                                      </span>
                                    </span>
                                  </Link>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <LegendDot color="bg-amber-400" label="Offen" />
        <LegendDot color="bg-blue-500" label="In Arbeit" />
        <LegendDot color="bg-emerald-500" label="Erledigt" />
        <LegendDot color="bg-emerald-700" label="QC erledigt" />
        <span className="ml-auto text-slate-500">
          {pending && 'Speichere …'} Dauer mit persönlichem Speed-Faktor.
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label}
    </span>
  );
}
