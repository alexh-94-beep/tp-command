import Link from 'next/link';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import { cleaningStatusLabel } from '@/lib/labels';
import type {
  CleaningPriority,
  CleaningStatus,
  CleaningType,
} from '@/types/aliases';
import CleaningToolbar from './cleaning-toolbar';
import NewCleaningButton from './new-cleaning-button';
import DamageReportButton from './damage-report-button';

export const metadata = { title: 'Reinigung' };

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

const typeLabel: Record<CleaningType, string> = {
  checkout: 'Auszugs-Reinigung',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Wiederkehrend',
  special: 'Spezial',
  deep_clean: 'Endreinigung',
  inspection: 'Inspektion',
  weekly_clean: 'Wöchentlich',
  weekly_clean_linen: 'Wöchentlich + Bettwäsche',
};

interface SearchParams {
  status?: string;
  type?: string;
  assignee?: string;
  range?: 'open' | 'today' | 'week' | 'all';
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

export default async function CleaningPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const range = sp.range ?? 'open';
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in7Iso = in7.toISOString().slice(0, 10);

  let query = supabase
    .from('cleaning_tasks')
    .select(
      'id, scheduled_date, scheduled_time, type, priority, status, notes, assigned_to, staff_id, apartment:apartments(id, number), external_apartment:external_apartments(id, label), staff:cleaning_staff(id, full_name)',
    )
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true, nullsFirst: false });

  if (range === 'today') query = query.eq('scheduled_date', today);
  else if (range === 'week')
    query = query.gte('scheduled_date', today).lte('scheduled_date', in7Iso);
  else if (range === 'open') query = query.in('status', ['open', 'in_progress']);

  if (sp.status) query = query.eq('status', sp.status as CleaningStatus);
  if (sp.type) query = query.eq('type', sp.type as CleaningType);
  if (sp.assignee === 'unassigned') query = query.is('staff_id', null);
  else if (sp.assignee) query = query.eq('staff_id', sp.assignee);

  const { data: tasks } = await query;

  const canManage = me.role === 'admin' || me.role === 'office';
  const { data: cleaners } = canManage
    ? await supabase
        .from('cleaning_staff')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name')
    : { data: [] };

  // Wohnungen fuer den "Neue Reinigung"-Wizard
  const { data: aptsForWizard } = canManage
    ? await supabase
        .from('apartments')
        .select('id, number')
        .neq('ownership', 'sold_external')
        .order('number')
    : { data: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reinigung"
        description={
          canManage
            ? 'Übersicht aller Reinigungs-Aufträge. Neue werden bei Auszug automatisch erzeugt.'
            : 'Deine Reinigungs-Aufträge.'
        }
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
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
              <NewCleaningButton
                apartments={(aptsForWizard ?? []).map((a) => ({
                  id: a.id,
                  number: a.number,
                }))}
                staff={(cleaners ?? []).map((c) => ({
                  id: c.id,
                  full_name: c.full_name,
                }))}
              />
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
        <>
        {/* Mobile: Card-Stack mit grossen Touch-Targets */}
        <div className="space-y-2 md:hidden">
          {(tasks ?? []).map((t) => (
            <Link
              key={t.id}
              href={`/cleaning/${t.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold">
                      {t.apartment?.number ?? t.external_apartment?.label ?? '–'}
                    </span>
                    <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    {typeLabel[t.type] ?? t.type}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {formatDate(t.scheduled_date)}
                    {t.scheduled_time && ` · ${t.scheduled_time}`}
                    {t.staff?.full_name && ` · ${t.staff.full_name}`}
                  </div>
                </div>
                <Badge tone={statusTone[t.status]}>
                  {cleaningStatusLabel[t.status]}
                </Badge>
              </div>
            </Link>
          ))}
        </div>

        {/* Desktop: Tabelle */}
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
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
              {(tasks ?? []).map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(t.scheduled_date)}
                    {t.scheduled_time && (
                      <span className="ml-2 text-xs text-slate-500">{t.scheduled_time}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    {t.apartment?.number ?? t.external_apartment?.label ?? '–'}
                    {t.external_apartment && (
                      <Badge tone="neutral" className="ml-2">
                        extern
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{typeLabel[t.type] ?? t.type}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {t.staff?.full_name ?? '–'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge tone={statusTone[t.status]}>{cleaningStatusLabel[t.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/cleaning/${t.id}`}
                      className="text-xs font-medium text-slate-700 hover:underline"
                    >
                      Öffnen →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
