import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { addDaysIso, daysBetween, mondayOfWeekIso, todayIso } from '@/lib/dates';
import WeeklyToolbar from './weekly-toolbar';
import WeeklyBoard, { type WeeklyStaff, type WeeklyTask } from './weekly-board';

export const metadata = { title: 'Wochenplan Reinigung' };

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole(['admin', 'office']);
  const sp = await searchParams;
  const baseDate =
    sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : todayIso();
  const weekStart = mondayOfWeekIso(baseDate);
  const weekEnd = addDaysIso(weekStart, 7);
  const days = daysBetween(weekStart, weekEnd);

  const supabase = await createSupabaseServerClient();

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
        'id, scheduled_date, scheduled_time, type, status, staff_id, estimated_duration_minutes, actual_duration_minutes, apartment:apartments(number), external_apartment:external_apartments(label), stay:subleasing_stays(guest_name)',
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

  const weeklyTasks: WeeklyTask[] = (tasks ?? []).map((t) => ({
    id: t.id,
    scheduled_date: t.scheduled_date,
    scheduled_time: t.scheduled_time,
    type: t.type,
    status: t.status,
    staff_id: t.staff_id,
    estimated_duration_minutes: t.estimated_duration_minutes,
    actual_duration_minutes: t.actual_duration_minutes,
    target: t.apartment?.number ?? t.external_apartment?.label ?? '–',
    guest: t.stay?.guest_name ?? null,
  }));

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
      />

      <WeeklyToolbar weekStart={weekStart} />

      <WeeklyBoard days={days} staff={weeklyStaff} initialTasks={weeklyTasks} />
    </div>
  );
}
