import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { todayIso } from '@/lib/dates';
import { cleaningStatusLabel } from '@/lib/labels';
import type { CleaningStatus, CleaningType } from '@/types/aliases';
import DailyToolbar from './daily-toolbar';

export const metadata = { title: 'Tagesplan Reinigung' };

const typeLabel: Record<CleaningType, string> = {
  checkout: 'Auszug',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Wiederkehrend',
  special: 'Spezial',
  deep_clean: 'Endreinigung',
  inspection: 'Inspektion',
  weekly_clean: 'Wöchentlich',
  weekly_clean_linen: 'Wöchentlich + Wäsche',
};

const statusTone: Record<CleaningStatus, 'neutral' | 'warning' | 'info' | 'success'> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  quality_checked: 'success',
};

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

  type Task = NonNullable<typeof tasks>[number];
  const tasksByStaff = new Map<string, Task[]>();
  for (const t of tasks ?? []) {
    const key = t.staff_id ?? 'unassigned';
    const arr = tasksByStaff.get(key) ?? [];
    arr.push(t);
    tasksByStaff.set(key, arr);
  }

  const columns: { key: string; title: string; tasks: Task[] }[] = [
    ...(staff ?? []).map((s) => ({
      key: s.id,
      title: s.team_name ? `${s.full_name} · ${s.team_name}` : s.full_name,
      tasks: tasksByStaff.get(s.id) ?? [],
    })),
    {
      key: 'unassigned',
      title: 'Nicht zugewiesen',
      tasks: tasksByStaff.get('unassigned') ?? [],
    },
  ];

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
        description="Übersicht pro Reinigerin. Zuweisung erfolgt auf der Detailseite einer Aufgabe."
      />

      <DailyToolbar date={date} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {columns.map((col) => (
          <div key={col.key} className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{col.title}</h3>
                <span className="text-xs text-slate-500">{col.tasks.length}</span>
              </div>
            </div>
            <div className="space-y-1 p-3">
              {col.tasks.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  Keine Aufträge
                </div>
              ) : (
                col.tasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/cleaning/${t.id}`}
                    className="block rounded-md border border-slate-100 p-2 text-sm hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {t.apartment?.number ??
                            t.external_apartment?.label ??
                            '–'}
                          {t.external_apartment && (
                            <Badge tone="neutral" className="ml-2">
                              extern
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {typeLabel[t.type]}
                          {t.scheduled_time ? ` · ${t.scheduled_time}` : ''}
                          {t.stay?.guest_name ? ` · ${t.stay.guest_name}` : ''}
                        </div>
                      </div>
                      <Badge tone={statusTone[t.status]} className="shrink-0">
                        {cleaningStatusLabel[t.status]}
                      </Badge>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
