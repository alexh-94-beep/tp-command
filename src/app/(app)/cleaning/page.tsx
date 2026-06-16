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
import CityusImportButton from './cityus-import-button';
import DamageReportButton from './damage-report-button';
import CleaningRow from './cleaning-row';

export const metadata = { title: 'Reinigung' };

const statusTone: Record<CleaningStatus, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  quality_checked: 'success',
  cancelled: 'danger',
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
  owner?: string;
  range?: 'open' | 'today' | 'week' | 'overdue' | 'all';
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

  if (range === 'today')
    query = query.eq('scheduled_date', today).neq('status', 'cancelled');
  else if (range === 'week')
    query = query
      .gte('scheduled_date', today)
      .lte('scheduled_date', in7Iso)
      .neq('status', 'cancelled');
  else if (range === 'overdue')
    query = query.in('status', ['open', 'in_progress']).lt('scheduled_date', today);
  else if (range === 'open') query = query.in('status', ['open', 'in_progress']);
  // range='all' zeigt alles inkl. cancelled — mit Storno-Badge

  if (sp.status) query = query.eq('status', sp.status as CleaningStatus);
  if (sp.type) query = query.eq('type', sp.type as CleaningType);
  if (sp.assignee === 'unassigned') query = query.is('staff_id', null);
  else if (sp.assignee) query = query.eq('staff_id', sp.assignee);

  // Eigentümer-Filter (Phase 13e)
  if (sp.owner === 'internal') {
    query = query.not('apartment_id', 'is', null);
  } else if (sp.owner === 'any_external') {
    query = query.not('external_apartment_id', 'is', null);
  } else if (sp.owner) {
    // Owner-ID: nur Cleaning-Tasks dessen external_apartment einen
    // bestimmten Owner hat. PostgREST filter via inner join.
    const { data: aptIds } = await supabase
      .from('external_apartments')
      .select('id')
      .eq('owner_id', sp.owner);
    const ids = (aptIds ?? []).map((a) => a.id);
    query = ids.length
      ? query.in('external_apartment_id', ids)
      : query.eq('id', '00000000-0000-0000-0000-000000000000'); // leeres Resultat
  }

  const { data: tasks } = await query;

  // Office/Admin haben volle Rechte. Mireme (cleaning) darf seit Phase 15
  // selber Reinigungsauftraege erfassen, aber keinen Cityus-Import, keine
  // Massen-Aktionen und keine Tagesplan-PDFs steuern.
  const canManage = me.role === 'admin' || me.role === 'office';
  const canCreate = canManage || me.role === 'cleaning';
  const { data: cleaners } = canCreate
    ? await supabase
        .from('cleaning_staff')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name')
    : { data: [] };

  // Wohnungen fuer den "Neue Reinigung"-Wizard
  const { data: aptsForWizard } = canCreate
    ? await supabase
        .from('apartments')
        .select('id, number')
        .neq('ownership', 'sold_external')
        .order('number')
    : { data: [] };

  // Externe Eigentuemer + deren Wohnungen
  const { data: ownersRaw } = canCreate
    ? await supabase
        .from('external_owners')
        .select(
          'id, name, external_apartments:external_apartments!external_apartments_owner_id_fkey(id, label)',
        )
        .eq('is_active', true)
        .order('name')
    : { data: [] };
  const externalOwners = (ownersRaw ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    apartments: (o.external_apartments ?? []).map((a) => ({
      id: a.id,
      label: a.label,
    })),
  }));

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
          canCreate ? (
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
                externalOwners={externalOwners}
              />
              {canManage ? (
                <>
                  <CityusImportButton />
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
                </>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <CleaningToolbar
        canManage={canCreate}
        cleaners={cleaners ?? []}
        owners={externalOwners.map((o) => ({ id: o.id, name: o.name }))}
      />

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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(tasks ?? []).map((t) => (
                <CleaningRow key={t.id} href={`/cleaning/${t.id}`}>
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
                </CleaningRow>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
