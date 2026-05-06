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
import type { CleaningStatus } from '@/types/db';

export const metadata = { title: 'Reinigungsauftrag · TP-Command' };

const typeLabel: Record<string, string> = {
  checkout: 'Auszugs-Reinigung',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Wiederkehrend',
  special: 'Spezial',
  deep_clean: 'Endreinigung',
  inspection: 'Inspektion',
  weekly_clean: 'Wöchentliche Reinigung',
};

function accessLabel(method: string): string {
  switch (method) {
    case 'key_available': return 'Schlüssel ist bei uns';
    case 'customer_at_home': return 'Kunde ist zuhause';
    case 'key_at_reception': return 'Schlüssel beim Empfang';
    case 'key_box': return 'Schlüsselbox';
    case 'other': return 'Anders';
    default: return method;
  }
}

const statusTone: Record<CleaningStatus, 'neutral' | 'warning' | 'info' | 'success'> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  quality_checked: 'success',
};

export default async function CleaningDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const supabase = createSupabaseServerClient();

  const { data: task } = await supabase
    .from('cleaning_tasks')
    .select(
      `
      id, scheduled_date, scheduled_time, scheduled_window, type, priority, status, notes,
      access_method, access_notes,
      assigned_to, staff_id, completed_at, quality_checked_at,
      estimated_duration_minutes, actual_duration_minutes,
      damage_found, damage_description, inspection_summary,
      apartment:apartments(id, number, keybox_default_code, keybox_default_location),
      external_apartment:external_apartments(id, label, address, contact_name, contact_phone, contact_email),
      staff:cleaning_staff(id, full_name, phone),
      booking:bookings(id, end_date, check_out_time, rental_type),
      stay:subleasing_stays(id, guest_name, check_in_date, check_in_time, check_out_date, check_out_time, keybox_code, source)
    `,
    )
    .eq('id', params.id)
    .single();

  if (!task) notFound();

  const apt = task.apartment as { id: string; number: string; keybox_default_code: string | null; keybox_default_location: string | null } | null;
  const ext = task.external_apartment as
    | { id: string; label: string; address: string | null; contact_name: string | null; contact_phone: string | null; contact_email: string | null }
    | null;
  const stay = task.stay as
    | { id: string; guest_name: string; check_in_date: string; check_in_time: string | null; check_out_date: string; check_out_time: string | null; keybox_code: string | null; source: string }
    | null;
  const staff = task.staff as { id: string; full_name: string; phone: string | null } | null;
  const booking = task.booking as { id: string; end_date: string; check_out_time: string | null; rental_type: string } | null;

  const { data: cleaners } =
    user.role === 'admin' || user.role === 'office'
      ? await supabase
          .from('cleaning_staff')
          .select('id, full_name')
          .eq('is_active', true)
          .order('full_name')
      : { data: [] };

  const { data: photos } = await supabase
    .from('cleaning_photos')
    .select('id, storage_path, uploaded_at')
    .eq('cleaning_task_id', task.id)
    .order('uploaded_at', { ascending: false });

  // Public-URLs vorberechnen
  const photosWithUrl = await Promise.all(
    (photos ?? []).map(async (p) => {
      const { data } = await supabase.storage
        .from('cleaning-photos')
        .createSignedUrl(p.storage_path, 60 * 60);
      return { ...p, url: data?.signedUrl ?? null };
    }),
  );

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
        description={`${typeLabel[task.type] ?? task.type} · ${formatDate(task.scheduled_date)}`}
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={statusTone[task.status as CleaningStatus]}>
          {cleaningStatusLabel[task.status as CleaningStatus]}
        </Badge>
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
            <CardTitle>Termin & Zutritt</CardTitle>
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
                {accessLabel(task.access_method)}
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
              <span className="text-slate-500">Reinigerin:</span>{' '}
              {staff?.full_name ?? '–'}
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
              <p className="whitespace-pre-wrap text-sm text-slate-700">{task.notes}</p>
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
          <CardBody className="text-sm space-y-1">
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
                    <a href={`mailto:${ext.contact_email}`} className="text-blue-600 hover:underline">
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

      <DurationForm
        taskId={task.id}
        estimatedMinutes={(task as unknown as { estimated_duration_minutes: number | null }).estimated_duration_minutes}
        actualMinutes={(task as unknown as { actual_duration_minutes: number | null }).actual_duration_minutes}
      />

      {task.type === 'inspection' && (
        <InspectionForm
          taskId={task.id}
          damageFound={(task as unknown as { damage_found: boolean | null }).damage_found}
          damageDescription={(task as unknown as { damage_description: string | null }).damage_description}
          inspectionSummary={(task as unknown as { inspection_summary: string | null }).inspection_summary}
        />
      )}

      <CleaningTaskActions
        taskId={task.id}
        status={task.status as CleaningStatus}
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
                    <img src={p.url} alt="Reinigungsfoto" className="aspect-square w-full object-cover" />
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
