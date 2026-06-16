import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import {
  standaloneTaskCategoryLabel,
  standaloneTaskPriorityLabel,
  standaloneTaskPriorityTone,
  standaloneTaskStatusLabel,
  standaloneTaskStatusTone,
} from '@/lib/labels';
import StandaloneTaskActions from './standalone-task-actions';

export const metadata = { title: 'Aufgabe' };
export const dynamic = 'force-dynamic';

export default async function StandaloneTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: task } = await supabase
    .from('standalone_tasks')
    .select(
      `id, title, description, category, priority, status, notes,
       apartment_id, apartment_label, assignee_id, due_date, due_time,
       created_at, created_by, done_at, done_by,
       apartment:apartments(id, number),
       assignee:users!standalone_tasks_assignee_id_fkey(id, full_name, role),
       creator:users!standalone_tasks_created_by_fkey(id, full_name)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!task) notFound();

  // Stamm-Daten fuer das Edit-Form
  const [{ data: apartmentsRaw }, { data: usersRaw }] = await Promise.all([
    supabase
      .from('apartments')
      .select('id, number')
      .neq('ownership', 'sold_external')
      .order('number'),
    supabase
      .from('users')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name'),
  ]);

  const canEdit =
    me.role === 'admin' ||
    me.role === 'office' ||
    me.role === 'management' ||
    (me.role === 'cleaning' &&
      (task.created_by === me.id || task.assignee_id === me.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/dashboard" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zum Dashboard
          </span>
        </Link>
      </div>

      <PageHeader
        title={task.title}
        description={`${standaloneTaskCategoryLabel[task.category]} · erfasst von ${task.creator?.full_name ?? '–'}`}
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={standaloneTaskStatusTone[task.status]}>
          {standaloneTaskStatusLabel[task.status]}
        </Badge>
        <Badge tone={standaloneTaskPriorityTone[task.priority]}>
          {standaloneTaskPriorityLabel[task.priority]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            {(task.apartment?.number || task.apartment_label) && (
              <div>
                <span className="text-slate-500">Wohnung:</span>{' '}
                <span className="font-medium">
                  {task.apartment?.number ?? task.apartment_label}
                </span>
                {task.apartment_label && !task.apartment?.number && (
                  <Badge tone="neutral" className="ml-2">
                    Freitext
                  </Badge>
                )}
              </div>
            )}
            <div>
              <span className="text-slate-500">Zugewiesen:</span>{' '}
              {task.assignee?.full_name ?? (
                <span className="text-slate-400">— offen —</span>
              )}
              {task.assignee?.role && (
                <span className="ml-2 text-xs text-slate-400">
                  ({task.assignee.role})
                </span>
              )}
            </div>
            {task.due_date && (
              <div>
                <span className="text-slate-500">Fällig:</span>{' '}
                {formatDate(task.due_date)}
                {task.due_time && (
                  <span className="ml-2 text-slate-700">
                    {task.due_time.slice(0, 5)}
                  </span>
                )}
              </div>
            )}
            {task.done_at && (
              <div>
                <span className="text-slate-500">Erledigt am:</span>{' '}
                {new Date(task.done_at).toLocaleString('de-CH')}
              </div>
            )}
            <div className="text-xs text-slate-400">
              Erfasst am {new Date(task.created_at).toLocaleString('de-CH')}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Beschreibung &amp; Notizen</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            {task.description ? (
              <div>
                <div className="text-xs text-slate-500">Beschreibung</div>
                <p className="whitespace-pre-wrap text-slate-800">
                  {task.description}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Keine Beschreibung.</p>
            )}
            {task.notes && (
              <div>
                <div className="text-xs text-slate-500">Notiz</div>
                <p className="whitespace-pre-wrap text-slate-800">{task.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {canEdit && (
        <StandaloneTaskActions
          task={{
            id: task.id,
            title: task.title,
            description: task.description,
            category: task.category,
            priority: task.priority,
            status: task.status,
            apartment_id: task.apartment_id,
            apartment_label: task.apartment_label,
            assignee_id: task.assignee_id,
            due_date: task.due_date,
            due_time: task.due_time,
            notes: task.notes,
          }}
          apartments={(apartmentsRaw ?? []).map((a) => ({
            id: a.id,
            number: a.number,
          }))}
          users={(usersRaw ?? []).map((u) => ({
            id: u.id,
            full_name: u.full_name,
            role: u.role,
          }))}
          canDelete={me.role === 'admin' || me.role === 'office'}
        />
      )}
    </div>
  );
}
