/**
 * Mireme/Cleaning-Rollen-Dashboard (Phase 15).
 *
 * Anders als das Office/Admin-Dashboard zeigt diese Sicht nur, was fuer das
 * Reinigungs-Team relevant ist:
 *   - Offene Reinigungen heute (gross, gleich klickbar)
 *   - Eigene offene + ueberfaellige Aufgaben (cleaning + workflow + standalone)
 *   - Anstehende Einzuege der naechsten 3 Tage — damit Mireme die Reinigung
 *     vorbereiten und das Inventar pruefen kann
 *   - Schnellzugriff zum Erfassen neuer Auftraege
 *
 * Keine Zahlungs- oder Pool-Reservationen-Kacheln — die sind fuers Office.
 */
import Link from 'next/link';
import {
  Sparkles,
  AlertTriangle,
  ListChecks,
  ArrowDownToLine,
  Plus,
  ClipboardList,
  CalendarDays,
  Inbox,
} from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { addDaysIso, formatDate, formatDateLong, todayIso } from '@/lib/dates';
import { rentalTypeLabel } from '@/lib/labels';
import type { AppUser } from '@/lib/auth/session';
import NewStandaloneTaskButton from './new-standalone-task-button';

export default async function CleaningDashboard({ me }: { me: AppUser }) {
  const supabase = await createSupabaseServerClient();
  const today = todayIso();
  const in3 = addDaysIso(today, 3);
  const in7 = addDaysIso(today, 7);

  const [
    cleanOpenToday,
    cleanOverdueAll,
    myCleanings,
    myWorkflowTasks,
    myStandaloneTasks,
    upcomingMoveIns,
    poolPendingCount,
  ] = await Promise.all([
    // Offene Reinigungen heute (alle, nicht nur eigene — Mireme plant)
    supabase
      .from('cleaning_tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress'])
      .eq('scheduled_date', today),
    supabase
      .from('cleaning_tasks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress'])
      .lt('scheduled_date', today),
    // Meine Reinigungen heute + ueberfaellig (max 10)
    supabase
      .from('cleaning_tasks')
      .select(
        'id, scheduled_date, scheduled_time, type, status, priority, apartment:apartments(number), external_apartment:external_apartments(label)',
      )
      .in('status', ['open', 'in_progress'])
      .eq('assigned_to', me.id)
      .lte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true, nullsFirst: false })
      .limit(15),
    // Meine Workflow-Aufgaben (alle offenen, sortiert nach Faelligkeit)
    // Tasks ohne due_date werden nicht ausgefiltert — Mireme soll sie sehen.
    supabase
      .from('booking_tasks')
      .select(
        'id, title, due_date, kind, status, booking:bookings(id, apartment:apartments(number))',
      )
      .in('status', ['open', 'in_progress'])
      .eq('assigned_to', me.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20),
    // Meine Standalone-Aufgaben: zugewiesen ODER von ihr erstellt — sie soll
    // ihre selbst erfassten Telefon-Aufgaben auch sehen, wenn sie noch
    // niemandem zugeordnet sind oder sich selbst zugeordnet wurden.
    supabase
      .from('standalone_tasks')
      .select(
        'id, title, category, priority, status, due_date, due_time, apartment_label, apartment:apartments(number)',
      )
      .in('status', ['open', 'in_progress'])
      .or(`assignee_id.eq.${me.id},created_by.eq.${me.id}`)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20),
    // Anstehende Einzuege (0-3 Tage) — egal welche Mietart
    supabase
      .from('bookings')
      .select(
        'id, start_date, rental_type, apartment:apartments(number, type), tenant:tenants!bookings_tenant_id_fkey(first_name, last_name)',
      )
      .in('status', ['planned', 'active'])
      .gte('start_date', today)
      .lte('start_date', in3)
      .order('start_date', { ascending: true })
      .limit(30),
    // Offene Booking-Pool-Reservationen — Mireme verteilt sie
    supabase
      .from('pending_reservations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  // Zusaetzlich Einzuege Tag 4-7 als Hinweis-Liste (sekundaer)
  const { data: laterMoveIns } = await supabase
    .from('bookings')
    .select(
      'id, start_date, rental_type, apartment:apartments(number)',
    )
    .in('status', ['planned', 'active'])
    .gt('start_date', in3)
    .lte('start_date', in7)
    .order('start_date', { ascending: true })
    .limit(20);

  // Stammdaten fuer den "Aufgabe erfassen"-Wizard (Telefon-Annahme)
  const [{ data: aptOpts }, { data: userOpts }] = await Promise.all([
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
  const apartments = (aptOpts ?? []).map((a) => ({ id: a.id, number: a.number }));
  const usersForAssign = (userOpts ?? []).map((u) => ({
    id: u.id,
    full_name: u.full_name,
    role: u.role,
  }));

  const cleaningsToday = cleanOpenToday.count ?? 0;
  const cleaningsOverdue = cleanOverdueAll.count ?? 0;
  const poolPending = poolPendingCount.count ?? 0;
  const myTasks = [
    ...(myCleanings.data ?? []).map((c) => ({
      kind: 'cleaning' as const,
      id: c.id,
      title: `Reinigung ${c.apartment?.number ?? c.external_apartment?.label ?? '–'}`,
      due: c.scheduled_date,
      sub: `${c.type}${c.scheduled_time ? ' · ' + c.scheduled_time : ''}`,
      priority: c.priority,
      href: `/cleaning/${c.id}`,
    })),
    ...(myWorkflowTasks.data ?? []).map((w) => ({
      kind: 'workflow' as const,
      id: w.id,
      title: w.title,
      due: w.due_date ?? today,
      sub: `Wohnung ${w.booking?.apartment?.number ?? '–'} · ${w.kind === 'move_in' ? 'Einzug' : 'Auszug'}`,
      priority: 'normal',
      href: w.booking ? `/bookings/${w.booking.id}` : '/tasks',
    })),
    ...(myStandaloneTasks.data ?? []).map((s) => {
      const aptText =
        s.apartment?.number ?? s.apartment_label ?? null;
      const baseSub = aptText ? `Wohnung ${aptText}` : (s.category ?? 'Allgemein');
      const timeText = s.due_time ? ` · ${s.due_time.slice(0, 5)}` : '';
      return {
        kind: 'standalone' as const,
        id: s.id,
        title: s.title,
        // Tasks ohne due_date erscheinen am Ende der Liste (FAR_FUTURE)
        due: s.due_date ?? '9999-12-31',
        sub: `${baseSub}${timeText}`,
        priority: s.priority ?? 'normal',
        href: `/tasks/${s.id}`,
      };
    }),
  ].sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hallo ${me.fullName.split(' ')[0]}`}
        description={`Übersicht für ${formatDateLong(today)}.`}
        actions={
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
            <Link href="/cleaning">
              <Button variant="secondary">
                <Sparkles className="h-4 w-4" />
                Alle Reinigungen
              </Button>
            </Link>
            <NewStandaloneTaskButton
              apartments={apartments}
              users={usersForAssign}
              label="Aufgabe erfassen"
            />
            <Link href="/cleaning?range=today">
              <Button>
                <Plus className="h-4 w-4" />
                Reinigung erfassen
              </Button>
            </Link>
          </div>
        }
      />

      {poolPending > 0 && (
        <Link
          href="/bookings/pending"
          className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span className="inline-flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            <strong>{poolPending}</strong> offene Pool-Reservation(en) brauchen
            eine Wohnungs-Zuweisung
          </span>
          <span className="text-xs">Jetzt verteilen →</span>
        </Link>
      )}

      {/* Schnell-Zahlen-Zeile */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/cleaning?range=today"
          className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <div className="flex items-center gap-2 text-slate-500">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm">Reinigungen heute (offen)</span>
          </div>
          <div className="mt-3 text-3xl font-semibold tabular-nums">
            {cleaningsToday}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tippe für den Tagesplan
          </p>
        </Link>
        <Link
          href="/cleaning?range=overdue"
          className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <div className="flex items-center gap-2 text-slate-500">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm">Reinigungen überfällig</span>
          </div>
          <div
            className={`mt-3 text-3xl font-semibold tabular-nums ${cleaningsOverdue > 0 ? 'text-red-600' : 'text-slate-900'}`}
          >
            {cleaningsOverdue}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Geplant vor heute, nicht erledigt
          </p>
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-500">
            <ListChecks className="h-5 w-5" />
            <span className="text-sm">Meine offenen Aufgaben</span>
          </div>
          <div className="mt-3 text-3xl font-semibold tabular-nums">
            {myTasks.length}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Heute + überfällig (siehe unten)
          </p>
        </div>
      </section>

      {/* Meine Aufgaben heute + ueberfaellig */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-600">
            Meine offenen Aufgaben
          </h2>
          <span className="text-xs text-slate-500">{myTasks.length} Einträge</span>
        </div>
        {myTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            Aktuell keine offenen Aufgaben für dich. 🎉
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {myTasks.map((t) => {
                const hasDate = t.due !== '9999-12-31';
                const isOverdue = hasDate && t.due < today;
                const isToday = hasDate && t.due === today;
                return (
                  <li key={`${t.kind}-${t.id}`}>
                    <Link
                      href={t.href as never}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">
                            {t.title}
                          </span>
                          <Badge
                            tone={
                              t.kind === 'cleaning'
                                ? 'info'
                                : t.kind === 'workflow'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {t.kind === 'cleaning'
                              ? 'Reinigung'
                              : t.kind === 'workflow'
                                ? 'Workflow'
                                : 'Auftrag'}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">{t.sub}</div>
                      </div>
                      <div className="text-right">
                        {!hasDate ? (
                          <span className="text-xs text-slate-400">
                            ohne Datum
                          </span>
                        ) : isOverdue ? (
                          <Badge tone="danger">{formatDate(t.due)}</Badge>
                        ) : isToday ? (
                          <Badge tone="warning">heute</Badge>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {formatDate(t.due)}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Kommende Einzuege */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-600">
            Anstehende Einzüge (heute bis in 3 Tagen)
          </h2>
          <span className="text-xs text-slate-500">
            {(upcomingMoveIns.data ?? []).length} Einträge
          </span>
        </div>
        {(upcomingMoveIns.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            Keine Einzüge in den nächsten 3 Tagen.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {(upcomingMoveIns.data ?? []).map((b) => {
                const name = [b.tenant?.first_name, b.tenant?.last_name]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li key={b.id}>
                    <Link
                      href={`/bookings/${b.id}` as never}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                          <span className="font-medium text-slate-900">
                            {b.apartment?.number ?? '–'}
                          </span>
                          {b.apartment?.type && (
                            <span className="text-xs text-slate-400">
                              {b.apartment.type}
                            </span>
                          )}
                          <Badge
                            tone={
                              b.rental_type === 'booking'
                                ? 'info'
                                : b.rental_type === 'short_term'
                                  ? 'warning'
                                  : 'success'
                            }
                          >
                            {rentalTypeLabel[b.rental_type]}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {name || 'Mieter offen'}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-slate-900">
                          {formatDate(b.start_date)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {(laterMoveIns ?? []).length > 0 && (
          <details className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <summary className="cursor-pointer text-slate-600">
              + {(laterMoveIns ?? []).length} weitere Einzüge in Tag 4–7
            </summary>
            <ul className="mt-2 divide-y divide-slate-100">
              {(laterMoveIns ?? []).map((b) => (
                <li key={b.id} className="flex justify-between px-2 py-2">
                  <Link href={`/bookings/${b.id}` as never} className="hover:underline">
                    {b.apartment?.number ?? '–'} · {rentalTypeLabel[b.rental_type]}
                  </Link>
                  <span className="text-slate-500">{formatDate(b.start_date)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <ClipboardList className="mr-1 inline h-4 w-4" />
        Aufgaben werden dir automatisch zugeteilt — Office kann Aufgaben
        ändern oder umverteilen.
      </div>
    </div>
  );
}
