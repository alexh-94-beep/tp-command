import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { addDaysIso, todayIso } from '@/lib/dates';
import AuditFilters from './audit-filters';
import AuditDiff from './audit-diff';
import { AUDIT_ENTITIES, type AuditEntity } from '@/services/audit/log';

export const metadata = { title: 'Audit-Log' };
export const dynamic = 'force-dynamic';

const ENTITY_LABEL: Record<AuditEntity, string> = {
  booking: 'Buchung',
  booking_task: 'Workflow-Aufgabe',
  cleaning_task: 'Reinigung',
  standalone_task: 'Aufgabe',
  debitor_invoice: 'Rechnung',
  apartment: 'Wohnung',
  apartment_damage: 'Schaden',
  pending_reservation: 'Pool-Reservation',
  external_owner: 'Eigentümer',
  parking_spot: 'Parkplatz',
  parking_assignment: 'PP-Belegung',
  user: 'User',
};

const ENTITY_HREF: Record<AuditEntity, ((id: string) => string) | null> = {
  booking: (id) => `/bookings/${id}`,
  booking_task: null, // direkt-Link ist Booking, nicht task — UI fokussiert auf Booking
  cleaning_task: (id) => `/cleaning/${id}`,
  standalone_task: (id) => `/tasks/${id}`,
  debitor_invoice: (id) => `/invoices/${id}`,
  apartment: (id) => `/apartments/${id}`,
  apartment_damage: null,
  pending_reservation: null,
  external_owner: null,
  parking_spot: (id) => `/parking/${id}`,
  parking_assignment: null,
  user: null,
};

interface SearchParams {
  actor?: string;
  entity?: string;
  action?: string;
  from?: string;
  to?: string;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(['admin']);
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const today = todayIso();
  const from = sp.from ?? addDaysIso(today, -30);
  const to = sp.to ?? today;

  let query = supabase
    .from('audit_log')
    .select(
      'id, actor_id, entity_type, entity_id, action, diff, created_at, actor:users!audit_log_actor_id_fkey(full_name, role)',
    )
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false })
    .limit(500);

  if (sp.actor) query = query.eq('actor_id', sp.actor);
  if (sp.entity) query = query.eq('entity_type', sp.entity);
  if (sp.action) query = query.eq('action', sp.action);

  const { data: rows } = await query;

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, role')
    .order('full_name');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/settings" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zu Einstellungen
          </span>
        </Link>
      </div>

      <PageHeader
        title="Audit-Log"
        description={`Aktivität ${from} → ${to} · ${rows?.length ?? 0} Einträge`}
      />

      <AuditFilters
        users={(users ?? []).map((u) => ({
          id: u.id,
          full_name: u.full_name,
          role: u.role,
        }))}
        entities={AUDIT_ENTITIES.map((e) => ({ value: e, label: ENTITY_LABEL[e] }))}
        defaults={{
          actor: sp.actor ?? '',
          entity: sp.entity ?? '',
          action: sp.action ?? '',
          from,
          to,
        }}
      />

      {(rows?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          Keine Einträge im aktuellen Filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Zeitpunkt</th>
                <th className="px-4 py-3">Wer</th>
                <th className="px-4 py-3">Aktion</th>
                <th className="px-4 py-3">Worauf</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(rows ?? []).map((r) => {
                const ent = r.entity_type as AuditEntity;
                const hrefFn = ENTITY_HREF[ent];
                const entLabel = ENTITY_LABEL[ent] ?? r.entity_type;
                return (
                  <tr key={r.id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                      {new Date(r.created_at).toLocaleString('de-CH')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.actor?.full_name ?? '—'}
                      {r.actor?.role && (
                        <span className="ml-1 text-xs text-slate-400">
                          ({r.actor.role})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge tone={actionTone(r.action)}>{actionLabel(r.action)}</Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-slate-500">{entLabel}</span>{' '}
                      {hrefFn && r.entity_id ? (
                        <Link
                          href={hrefFn(r.entity_id) as never}
                          className="text-blue-600 hover:underline"
                        >
                          öffnen →
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {r.entity_id?.slice(0, 8) ?? '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AuditDiff diff={r.diff as Record<string, unknown> | null} />
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

function actionLabel(a: string): string {
  switch (a) {
    case 'created':
      return 'Erstellt';
    case 'updated':
      return 'Geändert';
    case 'status_changed':
      return 'Status geändert';
    case 'assigned':
      return 'Zugewiesen';
    case 'cancelled':
      return 'Storniert';
    case 'deleted':
      return 'Gelöscht';
    case 'finalized':
      return 'Finalisiert';
    case 'invoiced':
      return 'Rechnung erstellt';
    default:
      return a;
  }
}

function actionTone(a: string): 'neutral' | 'success' | 'warning' | 'info' | 'danger' {
  switch (a) {
    case 'created':
      return 'success';
    case 'updated':
    case 'status_changed':
      return 'info';
    case 'assigned':
      return 'info';
    case 'cancelled':
    case 'deleted':
      return 'danger';
    case 'finalized':
    case 'invoiced':
      return 'success';
    default:
      return 'neutral';
  }
}
