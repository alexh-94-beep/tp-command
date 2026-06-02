import Link from 'next/link';
import { ArrowRight, ListChecks } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { addDaysIso, formatDate, todayIso } from '@/lib/dates';
import TasksToolbar from './tasks-toolbar';
import TaskQuickComplete from './task-quick-complete';
import type { BookingTaskStatus, WorkflowKind } from '@/types/aliases';

export const metadata = { title: 'Aufgaben' };

interface SearchParams {
  range?: 'overdue' | 'today' | 'week' | 'month' | 'open' | 'all';
  kind?: 'move_in' | 'move_out';
  category?: string;
  scope?: 'long_term' | 'short_term' | 'booking';
}

const statusToneMap: Record<
  BookingTaskStatus,
  'neutral' | 'success' | 'warning' | 'info' | 'danger'
> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  skipped: 'neutral',
  na: 'neutral',
};

const statusLabelMap: Record<BookingTaskStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  done: 'Erledigt',
  skipped: 'Übersprungen',
  na: 'N/A',
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(['admin', 'office']);
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const today = todayIso();
  const range = sp.range ?? 'open';

  let query = supabase
    .from('booking_tasks')
    .select(
      `
      id, booking_id, title, description, category, kind, status, due_date,
      is_optional, is_conditional,
      booking:bookings(
        id, rental_type,
        apartment:apartments(id, number, building),
        tenant:tenants!bookings_tenant_id_fkey(first_name, last_name)
      )
    `,
    )
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (range === 'overdue') {
    query = query.in('status', ['open', 'in_progress']).lt('due_date', today);
  } else if (range === 'today') {
    query = query.in('status', ['open', 'in_progress']).eq('due_date', today);
  } else if (range === 'week') {
    query = query
      .in('status', ['open', 'in_progress'])
      .gte('due_date', today)
      .lte('due_date', addDaysIso(today, 7));
  } else if (range === 'month') {
    query = query
      .in('status', ['open', 'in_progress'])
      .gte('due_date', today)
      .lte('due_date', addDaysIso(today, 30));
  } else if (range === 'open') {
    query = query.in('status', ['open', 'in_progress']);
  }
  // 'all' = kein Status-Filter

  if (sp.kind) query = query.eq('kind', sp.kind as WorkflowKind);
  if (sp.category) query = query.eq('category', sp.category);

  const { data: rows } = await query.limit(500);

  // Scope-Filter nach dem Load (haengt am Booking-Join)
  const filtered = (rows ?? []).filter((r) => {
    if (!r.booking) return false;
    if (sp.scope && r.booking.rental_type !== sp.scope) return false;
    return true;
  });

  // Distinct categories fuer den Toolbar-Picker
  const { data: catRows } = await supabase
    .from('booking_tasks')
    .select('category')
    .not('category', 'is', null)
    .in('status', ['open', 'in_progress']);
  const categories = Array.from(
    new Set((catRows ?? []).map((c) => c.category as string).filter(Boolean)),
  ).sort();

  const overdue = filtered.filter(
    (r) =>
      r.due_date &&
      r.due_date < today &&
      (r.status === 'open' || r.status === 'in_progress'),
  ).length;
  const todayCount = filtered.filter(
    (r) => r.due_date === today && (r.status === 'open' || r.status === 'in_progress'),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aufgaben"
        description={`${overdue} überfällig · ${todayCount} heute · ${filtered.length} im aktuellen Filter`}
      />

      <TasksToolbar categories={categories} />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">Keine Aufgaben im aktuellen Filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="w-10 px-3 py-3"></th>
                <th className="px-4 py-3">Fällig</th>
                <th className="px-4 py-3">Aufgabe</th>
                <th className="px-4 py-3">Phase</th>
                <th className="px-4 py-3">Wohnung / Mieter</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const b = r.booking;
                const apt = b?.apartment ?? null;
                const ten = b?.tenant ?? null;
                const due = r.due_date;
                const isOverdue =
                  !!due && due < today && (r.status === 'open' || r.status === 'in_progress');
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <TaskQuickComplete taskId={r.id} currentStatus={r.status} />
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {due ? (
                        isOverdue ? (
                          <Badge tone="danger">{formatDate(due)}</Badge>
                        ) : (
                          <span>{formatDate(due)}</span>
                        )
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{r.title}</div>
                      {r.description && (
                        <div className="text-xs text-slate-500">{r.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Badge tone={r.kind === 'move_in' ? 'info' : 'warning'}>
                        {r.kind === 'move_in' ? 'Einzug' : 'Auszug'}
                      </Badge>
                      {r.category && (
                        <span className="ml-2 text-[10px] tracking-wide text-slate-400 uppercase">
                          {r.category}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="font-medium">{apt?.number ?? '–'}</div>
                      {ten && (
                        <div className="text-xs text-slate-500">
                          {[ten.first_name, ten.last_name].filter(Boolean).join(' ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Badge tone={statusToneMap[r.status]}>{statusLabelMap[r.status]}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {b?.id && (
                        <Link
                          href={`/bookings/${b.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:underline"
                        >
                          Buchung <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
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
