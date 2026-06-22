import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import { cleaningStatusLabel } from '@/lib/labels';
import CleaningTaskActions from './task-actions';
import InspectionForm from './inspection-form';
import DurationForm from './duration-form';
import EditCancelSection from './edit-cancel-section';
import type { AccessMethod, CleaningStatus, CleaningType } from '@/types/aliases';

export const metadata = { title: 'Reinigungsauftrag' };

const typeLabel: Record<CleaningType, string> = {
  checkout: 'Auszugs-Reinigung',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Wiederkehrend',
  special: 'Spezial',
  deep_clean: 'Endreinigung',
  inspection: 'Inspektion',
  weekly_clean: 'Wöchentliche Reinigung',
  weekly_clean_linen: 'Wöchentlich + Bettwäsche',
  biweekly_clean: 'Zweiwöchentlich',
  biweekly_clean_linen: 'Zweiwöchentlich + Wäsche',
  monthly_clean: 'Monatlich',
  monthly_clean_linen: 'Monatlich + Wäsche',
};

const accessLabel: Record<AccessMethod, string> = {
  key_available: 'Schlüssel ist bei uns',
  customer_at_home: 'Kunde ist zuhause',
  key_at_reception: 'Schlüssel beim Empfang',
  key_box: 'Schlüsselbox',
  other: 'Anders',
};

const statusTone: Record<CleaningStatus, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  quality_checked: 'success',
  cancelled: 'danger',
};

export default async function CleaningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: task } = await supabase
    .from('cleaning_tasks')
    .select(
      `id, scheduled_date, scheduled_time, scheduled_window, type, priority, status, notes,
       access_method, access_notes, assigned_to, staff_id, completed_at, quality_checked_at,
       estimated_duration_minutes, actual_duration_minutes,
       damage_found, damage_description, inspection_summary,
       linen_change, time_flexible, time_constraint_note, source,
       cancellation_reason, cancelled_at,
       apartment:apartments(id, number, keybox_default_code, keybox_default_location),
       external_apartment:external_apartments(id, label, address, contact_name, contact_phone, contact_email),
       staff:cleaning_staff(id, full_name, phone),
       cancelled_by_user:users!cleaning_tasks_cancelled_by_fkey(full_name),
       booking:bookings(id, end_date, check_out_time, rental_type),
       stay:subleasing_stays(id, guest_name, check_in_date, check_in_time, check_out_date, check_out_time, keybox_code, source)`,
    )
    .eq('id', id)
    .single();

  if (!task) notFound();

  const apt = task.apartment;
  const ext = task.external_apartment;
  const stay = task.stay;
  const staff = task.staff;
  const booking = task.booking;

  const canManage = user.role === 'admin' || user.role === 'office';
  const { data: cleaners } = canManage
    ? await supabase
        .from('cleaning_staff')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name')
    : { data: [] };

  const { data: photos } = await supabase
    .from('cleaning_photos')
    .select('id, storage_path, created_at')
    .eq('cleaning_task_id', task.id)
    .order('created_at', { ascending: false });

  // Phase 19: createSignedUrls (plural) statt N parallele createSignedUrl —
  // eine Storage-Round-trip anstelle einer pro Photo.
  const paths = (photos ?? []).map((p) => p.storage_path);
  const { data: signed } = paths.length
    ? await supabase.storage.from('cleaning-photos').createSignedUrls(paths, 60 * 60)
    : { data: [] as Array<{ path: string | null; signedUrl: string }> };
  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path ?? '', s.signedUrl] as const),
  );
  const photosWithUrl = (photos ?? []).map((p) => ({
    ...p,
    url: urlByPath.get(p.storage_path) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/cleaning" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Liste
          </span>
        </Link>
      </div>

      <PageHeader
        title={`Reinigungsauftrag · ${apt?.number ?? ext?.label ?? '–'}`}
        description={`${typeLabel[task.type]} · ${formatDate(task.scheduled_date)}`}
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={statusTone[task.status]}>{cleaningStatusLabel[task.status]}</Badge>
        <Badge tone="neutral">Priorität: {task.priority}</Badge>
        {ext && <Badge tone="neutral">externe Wohnung</Badge>}
        {booking && (
          <Link href={`/bookings/${booking.id}`}>
            <Badge tone="info">zur Buchung →</Badge>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Termin &amp; Zutritt</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <div>
              <span className="text-slate-500">Datum:</span> {formatDate(task.scheduled_date)}
              {task.scheduled_time && (
                <>
                  {' · '}
                  <span className="text-slate-500">Zeit:</span> {task.scheduled_time}
                </>
              )}
            </div>
            {task.access_method && (
              <div>
                <span className="text-slate-500">Zutritt:</span>{' '}
                {accessLabel[task.access_method] ?? task.access_method}
                {task.access_notes && (
                  <span className="text-slate-500"> · {task.access_notes}</span>
                )}
              </div>
            )}
            {booking?.check_out_time && (
              <div>
                <span className="text-slate-500">Check-out Zeit:</span> {booking.check_out_time}
              </div>
            )}
            <div>
              <span className="text-slate-500">Bettwäsche:</span>{' '}
              {task.linen_change ? (
                <Badge tone="info">wird gewechselt</Badge>
              ) : (
                <span className="text-slate-700">nein</span>
              )}
            </div>
            <div>
              <span className="text-slate-500">Zeitlich:</span>{' '}
              {task.time_flexible ? (
                <span className="text-slate-700">flexibel</span>
              ) : (
                <Badge tone="warning">fixe Vorgabe</Badge>
              )}
              {!task.time_flexible && task.time_constraint_note && (
                <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  {task.time_constraint_note}
                </div>
              )}
            </div>
            <div>
              <span className="text-slate-500">Reinigerin:</span> {staff?.full_name ?? '–'}
              {staff?.phone && (
                <a href={`tel:${staff.phone}`} className="ml-2 text-blue-600 hover:underline">
                  {staff.phone}
                </a>
              )}
            </div>
            {task.completed_at && (
              <div>
                <span className="text-slate-500">Erledigt am:</span>{' '}
                {new Date(task.completed_at).toLocaleString('de-CH')}
              </div>
            )}
            {task.quality_checked_at && (
              <div>
                <span className="text-slate-500">QC am:</span>{' '}
                {new Date(task.quality_checked_at).toLocaleString('de-CH')}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notizen</CardTitle>
          </CardHeader>
          <CardBody>
            {task.notes ? (
              <p className="text-sm whitespace-pre-wrap text-slate-700">{task.notes}</p>
            ) : (
              <p className="text-sm text-slate-400">Keine Notizen.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {ext && (
        <Card>
          <CardHeader>
            <CardTitle>Externe Wohnung</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1 text-sm">
            <div className="font-medium">{ext.label}</div>
            {ext.address && <div className="text-slate-600">{ext.address}</div>}
            {(ext.contact_name || ext.contact_phone || ext.contact_email) && (
              <div className="mt-2 text-slate-700">
                {ext.contact_name && <div>{ext.contact_name}</div>}
                {ext.contact_phone && (
                  <div>
                    <a href={`tel:${ext.contact_phone}`} className="text-blue-600 hover:underline">
                      {ext.contact_phone}
                    </a>
                  </div>
                )}
                {ext.contact_email && (
                  <div>
                    <a
                      href={`mailto:${ext.contact_email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {ext.contact_email}
                    </a>
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {stay && (
        <Card>
          <CardHeader>
            <CardTitle>Aufenthalt ({stay.source})</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Gast</dt>
                <dd className="font-medium">{stay.guest_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Check-in</dt>
                <dd>
                  {formatDate(stay.check_in_date)}
                  {stay.check_in_time ? ` · ${stay.check_in_time}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Check-out</dt>
                <dd>
                  {formatDate(stay.check_out_date)}
                  {stay.check_out_time ? ` · ${stay.check_out_time}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Schlüsselbox</dt>
                <dd>
                  {stay.keybox_code ?? apt?.keybox_default_code ?? '–'}
                  {apt?.keybox_default_location ? ` (${apt.keybox_default_location})` : ''}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      )}

      <EditCancelSection
        taskId={task.id}
        status={task.status}
        canManage={canManage}
        defaults={{
          scheduled_date: task.scheduled_date,
          scheduled_time: task.scheduled_time,
          type: task.type,
          priority: task.priority,
          estimated_duration_minutes: task.estimated_duration_minutes,
          notes: task.notes,
          linen_change: task.linen_change,
          time_flexible: task.time_flexible,
          time_constraint_note: task.time_constraint_note,
        }}
        cancellation={
          task.status === 'cancelled'
            ? {
                reason: task.cancellation_reason,
                at: task.cancelled_at,
                by_name: task.cancelled_by_user?.full_name ?? null,
              }
            : undefined
        }
      />

      <DurationForm
        taskId={task.id}
        estimatedMinutes={task.estimated_duration_minutes}
        actualMinutes={task.actual_duration_minutes}
      />

      {task.type === 'inspection' && (
        <InspectionForm
          taskId={task.id}
          damageFound={task.damage_found}
          damageDescription={task.damage_description}
          inspectionSummary={task.inspection_summary}
        />
      )}

      <CleaningTaskActions
        taskId={task.id}
        status={task.status}
        currentAssignee={staff?.id ?? null}
        userRole={user.role}
        cleaners={cleaners ?? []}
      />

      {photosWithUrl.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fotos ({photosWithUrl.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photosWithUrl.map((p) => (
                <a
                  key={p.id}
                  href={p.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-md border border-slate-200"
                >
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.url}
                      alt="Reinigungsfoto"
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-square w-full bg-slate-100" />
                  )}
                </a>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
