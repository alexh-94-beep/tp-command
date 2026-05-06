import Link from 'next/link';
import { CalendarDays, Plus, RefreshCw, Upload } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import { cleaningStatusLabel } from '@/lib/labels';
import type { CleaningPriority, CleaningStatus, CleaningType } from '@/types/db';
import CleaningToolbar from './cleaning-toolbar';
import DamageReportButton from './damage-report-button';

export const metadata = { title: 'Reinigung · TP-Command' };

const statusTone: Record<CleaningStatus, 'neutral' | 'warning' | 'info' | 'success'> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  quality_checked: 'success',
};

const priorityTone: Record<CleaningPriority, 'neutral' | 'warning' | 'danger' | 'info'> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'danger',
};

const typeLabel: Record<string, string> = {
  checkout: 'Auszugs-Reinigung',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Wiederkehrend',
  special: 'Spezial',
  deep_clean: 'Endreinigung',
  inspection: 'Inspektion',
  weekly_clean: 'Wöchentlich',
};

interface SearchParams {
  status?: string;
  type?: string;
  assignee?: string;
  range?: 'open' | 'today' | 'week' | 'all';
}

export default async function CleaningPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser();
  const supabase = createSupabaseServerClient();

  const range = searchParams.range ?? 'open';
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in7Iso = in7.toISOString().slice(0, 10);

  let query = supabase
    .from('cleaning_tasks')
    .select(
      `
      id, scheduled_date, scheduled_time, type, priority, status, notes, assigned_to, staff_id,
      apartment:apartments(id, number),
      external_apartment:external_apartments(id, label),
      staff:cleaning_staff(id, full_name)
    `,
    )
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true, nullsFirst: false });

  if (range === 'today') query = query.eq('scheduled_date', today);
  else if (range === 'week') query = query.gte('scheduled_date', today).lte('scheduled_date', in7Iso);
  else if (range === 'open') query = query.in('status', ['open', 'in_progress']);

  if (searchParams.status) query = query.eq('status', searchParams.status);
  if (searchParams.type) query = query.eq('type', searchParams.type);
  if (searchParams.assignee === 'unassigned') query = query.is('staff_id', null);
  else if (searchParams.assignee && searchParams.assignee !== 'me') {
    query = query.eq('staff_id', searchParams.assignee);
  }

  const { data: tasks } = await query;

  // Aktive Cleaning-Staff (operative Personen, kein App-Zugriff nötig)
  const { data: cleaners } =
    me.role === 'admin' || me.role === 'office'
      ? await supabase
          .from('cleaning_staff')
          .select('id, full_name')
          .eq('is_active', true)
          .order('full_name')
      : { data: [] };

  const canManage = me.role === 'admin' || me.role === 'office';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reinigung"
        description={
          canManage
            ? 'Übersicht aller Reinigungs-Aufträge. Neue Aufträge werden bei Auszug automatisch erzeugt.'
            : 'Deine Reinigungs-Aufträge.'
        }
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Link href="/cleaning/daily">
                <Button variant="secondary">
                  <CalendarDays className="h-4 w-4" />
                  Tagesplan
                </Button>
              </Link>
              <Link href="/cleaning/weekly">
                <Button variant="secondary">
                  <CalendarDays className="h-4 w-4" />
                  Wochenplan
                </Button>
              </Link>
              <Link href="/cleaning/import-cityus">
                <Button variant="secondary">
                  <Upload className="h-4 w-4" />
                  Cityus-Plan
                </Button>
              </Link>
              <DamageReportButton />
              <form action={triggerForm}>
                <Button variant="secondary" type="submit">
                  <RefreshCw className="h-4 w-4" />
                  Aufträge generieren
                </Button>
              </form>
              <form action={recalcForm}>
                <Button variant="secondary" type="submit">
                  <RefreshCw className="h-4 w-4" />
                  Dauer neu berechnen
                </Button>
              </form>
              <Link href="/cleaning/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Neuer Auftrag
                </Button>
              </Link>
            </div>
          ) : undefined
        }
      />

      <CleaningToolbar canManage={canManage} cleaners={cleaners ?? []} />

      {(tasks ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Keine Aufträge im aktuellen Filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3">Wohnung</th>
                <th className="px-4 py-3">Typ</th>
                <th className="px-4 py-3">Priorität</th>
                <th className="px-4 py-3">Zugewiesen</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(tasks ?? []).map((t) => {
                const apt = t.apartment as { id: string; number: string } | null;
                const ext = t.external_apartment as { id: string; label: string } | null;
                const staff = t.staff as { id: string; full_name: string } | null;
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(t.scheduled_date)}
                      {t.scheduled_time && (
                        <span className="ml-2 text-xs text-slate-500">{t.scheduled_time}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {apt?.number ?? ext?.label ?? '–'}
                      {ext && (
                        <Badge tone="neutral" className="ml-2">
                          extern
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{typeLabel[t.type] ?? t.type}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge tone={priorityTone[t.priority as CleaningPriority]}>
                        {t.priority}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {staff?.full_name ?? '–'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge tone={statusTone[t.status as CleaningStatus]}>
                        {cleaningStatusLabel[t.status as CleaningStatus]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        href={`/cleaning/${t.id}`}
                        className="text-xs font-medium text-slate-700 hover:underline"
                      >
                        Öffnen →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function triggerForm() {
  'use server';
  const { triggerGenerateCleanings } = await import('@/server/cleaning/actions');
  await triggerGenerateCleanings();
}

async function recalcForm() {
  'use server';
  const { recalculateAllDurations } = await import('@/server/cleaning/actions');
  await recalculateAllDurations();
}
