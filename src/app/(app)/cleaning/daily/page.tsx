import Link from 'next/link';
import { ArrowLeft, FileDown } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { todayIso } from '@/lib/dates';
import DailyToolbar from './daily-toolbar';
import DailyBoard, { type DailyTask } from './daily-board';

export const metadata = { title: 'Tagesplan Reinigung · TP-Command' };

export default async function DailyPage({ searchParams }: { searchParams: { date?: string } }) {
  await requireRole(['admin', 'office']);

  const date =
    searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : todayIso();

  const supabase = createSupabaseServerClient();

  const [{ data: staff }, { data: tasks }] = await Promise.all([
    supabase
      .from('cleaning_staff')
      .select('id, full_name, team_name')
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('cleaning_tasks')
      .select(
        `
        id, scheduled_date, scheduled_time, type, priority, status, notes,
        access_method, staff_id,
        apartment:apartments(number),
        external_apartment:external_apartments(label),
        stay:subleasing_stays(guest_name)
      `,
      )
      .eq('scheduled_date', date)
      .order('scheduled_time', { ascending: true, nullsFirst: false }),
  ]);

  const dailyTasks: DailyTask[] = (tasks ?? []).map((t) => {
    const apt = t.apartment as { number: string } | null;
    const ext = t.external_apartment as { label: string } | null;
    const stay = t.stay as { guest_name: string } | null;
    return {
      id: t.id,
      scheduled_time: t.scheduled_time ?? null,
      type: t.type,
      status: t.status,
      staff_id: t.staff_id ?? null,
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
        title="Tagesplan Reinigung"
        description="Übersicht pro Reinigerin. Ziehe Aufträge per Drag & Drop zwischen den Karten zum Zuweisen."
        actions={
          <div className="flex gap-2">
            <Link href={`/cleaning/weekly?week=${date}`}>
              <Button variant="secondary">Wochenplan</Button>
            </Link>
            <Link href={`/api/cleaning/daily-pdf?date=${date}`} target="_blank">
              <Button variant="secondary">
                <FileDown className="h-4 w-4" />
                Alle als PDF
              </Button>
            </Link>
          </div>
        }
      />

      <DailyToolbar date={date} />

      <DailyBoard date={date} initialStaff={staff ?? []} initialTasks={dailyTasks} />
    </div>
  );
}
