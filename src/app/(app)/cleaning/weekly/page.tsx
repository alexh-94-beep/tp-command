import Link from 'next/link';
import { ArrowLeft, FileDown } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { addDaysIso, daysBetween, mondayOfWeekIso, todayIso } from '@/lib/dates';
import WeeklyToolbar from './weekly-toolbar';
import WeeklyBoard, { type WeeklyStaff, type WeeklyTask } from './weekly-board';

export const metadata = { title: 'Wochenplan Reinigung · TP-Command' };

export default async function WeeklyPage({ searchParams }: { searchParams: { week?: string } }) {
  await requireRole(['admin', 'office']);

  const baseDate =
    searchParams.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week) ? searchParams.week : todayIso();
  const weekStart = mondayOfWeekIso(baseDate);
  const weekEnd = addDaysIso(weekStart, 7);
  const days = daysBetween(weekStart, weekEnd);

  const supabase = createSupabaseServerClient();

  const [{ data: staff }, { data: tasks }] = await Promise.all([
    supabase
      .from('cleaning_staff')
      .select('id, full_name, speed_factor, pensum_percent, is_lead, is_hourly, team_name')
      .eq('is_active', true)
      .order('is_lead', { ascending: false })
      .order('full_name'),
    supabase
      .from('cleaning_tasks')
      .select(
        `
        id, scheduled_date, scheduled_time, type, status, staff_id,
        estimated_duration_minutes, actual_duration_minutes,
        apartment:apartments(number),
        external_apartment:external_apartments(label),
        stay:subleasing_stays(guest_name)
      `,
      )
      .gte('scheduled_date', weekStart)
      .lt('scheduled_date', weekEnd)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true, nullsFirst: false }),
  ]);

  const weeklyStaff: WeeklyStaff[] = (staff ?? []).map((s) => ({
    id: s.id,
    full_name: s.full_name,
    speed_factor: Number(s.speed_factor) || 1,
    pensum_percent: s.pensum_percent ?? 100,
    is_lead: s.is_lead,
    is_hourly: s.is_hourly,
    team_name: s.team_name ?? null,
  }));

  const weeklyTasks: WeeklyTask[] = (tasks ?? []).map((t) => {
    const apt = t.apartment as { number: string } | null;
    const ext = t.external_apartment as { label: string } | null;
    const stay = t.stay as { guest_name: string } | null;
    return {
      id: t.id,
      scheduled_date: t.scheduled_date,
      scheduled_time: t.scheduled_time ?? null,
      type: t.type,
      status: t.status,
      staff_id: t.staff_id ?? null,
      estimated_duration_minutes: t.estimated_duration_minutes ?? null,
      actual_duration_minutes: t.actual_duration_minutes ?? null,
      target: apt?.number ?? ext?.label ?? '–',
      guest: stay?.guest_name ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/cleaning" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Reinigungs-Liste
          </span>
        </Link>
      </div>

      <PageHeader
        title="Wochenplan Reinigung"
        description={`Woche ${new Date(weekStart).toLocaleDateString('de-CH')} – ${new Date(addDaysIso(weekStart, 6)).toLocaleDateString('de-CH')}. Aufträge per Drag & Drop verschieben (Person und/oder Tag).`}
        actions={
          <Link href={`/api/cleaning/daily-pdf?date=${weekStart}&days=7`} target="_blank">
            <Button variant="secondary">
              <FileDown className="h-4 w-4" />
              Woche als PDF
            </Button>
          </Link>
        }
      />

      <WeeklyToolbar weekStart={weekStart} />

      <WeeklyBoard
        weekStart={weekStart}
        days={days}
        staff={weeklyStaff}
        initialTasks={weeklyTasks}
      />
    </div>
  );
}
