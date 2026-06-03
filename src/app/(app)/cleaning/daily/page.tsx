import Link from 'next/link';
import { ArrowLeft, FileDown } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { todayIso } from '@/lib/dates';
import DailyToolbar from './daily-toolbar';
import DailyBoard, { type DailyStaff, type DailyTask } from './daily-board';

export const metadata = { title: 'Tagesplan Reinigung' };

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireRole(['admin', 'office']);
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIso();

  const supabase = await createSupabaseServerClient();

  const [{ data: staff }, { data: tasks }] = await Promise.all([
    supabase
      .from('cleaning_staff')
      .select('id, full_name, team_name')
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('cleaning_tasks')
      .select(
        'id, scheduled_time, type, status, priority, staff_id, apartment:apartments(number), external_apartment:external_apartments(label), stay:subleasing_stays(guest_name)',
      )
      .eq('scheduled_date', date)
      .order('scheduled_time', { ascending: true, nullsFirst: false }),
  ]);

  const dailyStaff: DailyStaff[] = (staff ?? []).map((s) => ({
    id: s.id,
    full_name: s.full_name,
    team_name: s.team_name ?? null,
  }));

  const dailyTasks: DailyTask[] = (tasks ?? []).map((t) => ({
    id: t.id,
    scheduled_time: t.scheduled_time,
    type: t.type,
    status: t.status,
    staff_id: t.staff_id,
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
        title="Tagesplan Reinigung"
        description="Übersicht pro Reinigerin. Ziehe Aufträge per Drag & Drop zwischen den Karten zum Zuweisen."
        actions={
          <div className="flex gap-2">
            <Link href={`/cleaning/weekly?week=${date}`}>
              <Button variant="secondary">Wochenplan</Button>
            </Link>
            <a
              href={`/api/cleaning/daily-pdf?date=${date}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="secondary">
                <FileDown className="h-4 w-4" />
                Alle als PDF
              </Button>
            </a>
          </div>
        }
      />

      <DailyToolbar date={date} />

      <DailyBoard date={date} initialStaff={dailyStaff} initialTasks={dailyTasks} />
    </div>
  );
}
