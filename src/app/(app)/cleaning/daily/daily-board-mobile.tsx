'use client';

/**
 * Mobile-Variante des Tagesplans (Phase 18).
 *
 * Statt HTML5-Drag&Drop (auf Mobile praktisch unbedienbar) liefert diese
 * Komponente Tap-to-Assign: pro Auftrag ein "Zuweisen"-Button, der ein
 * Bottom-Sheet mit den Reinigerinnen-Optionen öffnet. Ein Tap weist zu.
 *
 * Wird auf Mobile-Breite (<md) gerendert; das Desktop-Board läuft daneben
 * mit md:block.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileDown, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { assignTaskToStaff } from '@/server/cleaning/staff';
import type { CleaningStatus, CleaningType } from '@/types/aliases';
import type { DailyStaff, DailyTask } from './daily-board';

const TYPE_LABEL: Record<CleaningType, string> = {
  weekly_clean: 'Wöchentlich',
  weekly_clean_linen: 'Wöchentl. + Wäsche',
  biweekly_clean: 'Zweiwöchentlich',
  biweekly_clean_linen: 'Zweiwöchentlich + Wäsche',
  monthly_clean: 'Monatlich',
  monthly_clean_linen: 'Monatlich + Wäsche',
  checkout: 'Auszug',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Zwischen',
  inspection: 'Inspektion',
  special: 'Spezial',
  deep_clean: 'Endreinigung',
};

const STATUS_TONE: Record<CleaningStatus, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  quality_checked: 'success',
  cancelled: 'danger',
};

interface GroupedStaff {
  key: string;
  label: string;
  members: DailyStaff[];
  primaryId: string;
}

export default function DailyBoardMobile({
  date,
  initialStaff,
  initialTasks,
}: {
  date: string;
  initialStaff: DailyStaff[];
  initialTasks: DailyTask[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [pending, startTransition] = useTransition();
  const [picker, setPicker] = useState<DailyTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Staff-Gruppen (Team → eine Card)
  const groups: GroupedStaff[] = [];
  const seenTeams = new Set<string>();
  for (const s of initialStaff) {
    if (s.team_name) {
      if (seenTeams.has(s.team_name)) continue;
      const members = initialStaff.filter((m) => m.team_name === s.team_name);
      seenTeams.add(s.team_name);
      groups.push({
        key: `team:${s.team_name}`,
        label: s.team_name,
        members,
        primaryId: members[0].id,
      });
    } else {
      groups.push({
        key: `staff:${s.id}`,
        label: s.full_name,
        members: [s],
        primaryId: s.id,
      });
    }
  }

  function staffLabel(staffId: string | null): string {
    if (!staffId) return 'Noch nicht zugewiesen';
    const g = groups.find((gr) => gr.members.some((m) => m.id === staffId));
    return g ? g.label : '—';
  }

  function assign(staffId: string | null) {
    if (!picker) return;
    const task = picker;
    setPicker(null);
    if ((task.staff_id ?? null) === staffId) return;
    const prev = tasks;
    setTasks((cur) =>
      cur.map((t) => (t.id === task.id ? { ...t, staff_id: staffId } : t)),
    );
    startTransition(async () => {
      const r = await assignTaskToStaff(task.id, staffId);
      if (!r.ok) {
        setError(r.error ?? 'Zuweisung fehlgeschlagen');
        setTasks(prev);
      } else {
        router.refresh();
      }
    });
  }

  const unassigned = tasks.filter((t) => !t.staff_id);
  const assigned = tasks.filter((t) => t.staff_id);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Ohne Zuweisung */}
      {unassigned.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-amber-700">
            ⚠️ Ohne Zuweisung ({unassigned.length})
          </h2>
          <ul className="space-y-2">
            {unassigned.map((t) => (
              <TaskRow key={t.id} task={t} onAssign={() => setPicker(t)} />
            ))}
          </ul>
        </section>
      )}

      {/* Pro Gruppe */}
      {groups.map((g) => {
        const memberIds = g.members.map((m) => m.id);
        const myTasks = assigned.filter(
          (t) => t.staff_id && memberIds.includes(t.staff_id),
        );
        return (
          <section key={g.key}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">
                {g.label}{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({myTasks.length})
                </span>
              </h2>
              <Link
                href={`/api/cleaning/daily-pdf?date=${date}&staff_id=${g.primaryId}` as never}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="secondary" size="sm">
                  <FileDown className="h-4 w-4" />
                  PDF
                </Button>
              </Link>
            </div>
            {myTasks.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                Keine Aufträge.
              </p>
            ) : (
              <ul className="space-y-2">
                {myTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onAssign={() => setPicker(t)} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* Bottom-Sheet: Picker */}
      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-900/50"
          onClick={() => setPicker(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-base font-semibold">
                  {picker.target}
                  {picker.scheduled_time && (
                    <span className="ml-2 text-sm text-slate-500">
                      {picker.scheduled_time.slice(0, 5)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  Aktuell: {staffLabel(picker.staff_id)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPicker(null)}
                className="rounded-md p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto py-2">
              <li>
                <button
                  type="button"
                  onClick={() => assign(null)}
                  disabled={pending}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  <span className="text-slate-700">— ohne Zuweisung —</span>
                  {!picker.staff_id && (
                    <span className="text-xs text-blue-600">aktuell</span>
                  )}
                </button>
              </li>
              {groups.map((g) => {
                const isCurrent =
                  picker.staff_id !== null &&
                  g.members.some((m) => m.id === picker.staff_id);
                return (
                  <li key={g.key}>
                    <button
                      type="button"
                      onClick={() => assign(g.primaryId)}
                      disabled={pending}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      <span className="font-medium text-slate-900">{g.label}</span>
                      {isCurrent && (
                        <span className="text-xs text-blue-600">aktuell</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="pb-[env(safe-area-inset-bottom,0.5rem)]" />
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onAssign,
}: {
  task: DailyTask;
  onAssign: () => void;
}) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/cleaning/${task.id}` as never}
          className="min-w-0 flex-1"
        >
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">{task.target}</span>
            <Badge tone={STATUS_TONE[task.status]}>{task.status}</Badge>
          </div>
          <div className="mt-0.5 text-xs text-slate-600">
            {TYPE_LABEL[task.type] ?? task.type}
            {task.scheduled_time && (
              <span className="ml-2 text-slate-500">
                {task.scheduled_time.slice(0, 5)}
              </span>
            )}
          </div>
          {task.guest && (
            <div className="mt-0.5 text-xs text-slate-500">{task.guest}</div>
          )}
        </Link>
        <button
          type="button"
          onClick={onAssign}
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 active:bg-slate-100"
        >
          <UserPlus className="h-4 w-4" />
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}
