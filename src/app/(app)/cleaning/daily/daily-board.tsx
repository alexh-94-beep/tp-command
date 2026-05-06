'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { FileDown, GripVertical } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { assignTaskToStaff } from '@/server/cleaning/staff';
import { cleaningStatusLabel } from '@/lib/labels';
import type { CleaningStatus } from '@/types/db';

const TYPE_LABELS: Record<string, string> = {
  checkout: 'Auszug',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Wiederkehrend',
  weekly_clean: 'Wöchentlich',
  inspection: 'Inspektion',
  special: 'Spezial',
  deep_clean: 'Endreinigung',
};

const STATUS_TONE: Record<CleaningStatus, 'neutral' | 'warning' | 'info' | 'success'> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  quality_checked: 'success',
};

export interface DailyTask {
  id: string;
  scheduled_time: string | null;
  type: string;
  status: string;
  staff_id: string | null;
  target: string;
  guest: string | null;
}

interface Staff {
  id: string;
  full_name: string;
  team_name: string | null;
}

interface StaffGroup {
  key: string;            // 'team:Sevdale & Bide' oder 'staff:<uuid>'
  label: string;
  members: Staff[];       // mind. 1
  primaryStaffId: string; // Person, der bei Drop zugewiesen wird
}

interface Props {
  date: string;
  initialStaff: Staff[];
  initialTasks: DailyTask[];
}

const UNASSIGNED = 'unassigned';

export default function DailyBoard({ date, initialStaff, initialTasks }: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [pending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDrop(targetStaffId: string | null) {
    setDropTarget(null);
    if (!draggingId) return;
    const task = tasks.find((t) => t.id === draggingId);
    if (!task) return;
    setDraggingId(null);
    if ((task.staff_id ?? null) === targetStaffId) return;

    // Optimistic update
    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, staff_id: targetStaffId } : t)),
    );
    startTransition(async () => {
      const r = await assignTaskToStaff(task.id, targetStaffId);
      if (!r.ok) {
        setError(r.error ?? 'Zuweisung fehlgeschlagen');
        setTasks(previous);
      }
    });
  }

  const unassigned = tasks.filter((t) => !t.staff_id);

  // Staff zu Gruppen zusammenfassen (wenn team_name gesetzt → eine Gruppe)
  const groups: StaffGroup[] = [];
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
        primaryStaffId: members[0].id,
      });
    } else {
      groups.push({
        key: `staff:${s.id}`,
        label: s.full_name,
        members: [s],
        primaryStaffId: s.id,
      });
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {unassigned.length > 0 && (
        <DropZone
          title={`⚠️ ${unassigned.length} Aufträge ohne Zuweisung`}
          highlight={dropTarget === UNASSIGNED}
          tone="amber"
          onDragEnter={() => setDropTarget(UNASSIGNED)}
          onDragLeave={() => setDropTarget((prev) => (prev === UNASSIGNED ? null : prev))}
          onDrop={() => handleDrop(null)}
        >
          {unassigned.map((t) => (
            <DraggableTaskCard
              key={t.id}
              task={t}
              isDragging={draggingId === t.id}
              onDragStart={() => setDraggingId(t.id)}
              onDragEnd={() => setDraggingId(null)}
              compact={false}
            />
          ))}
        </DropZone>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const memberIds = g.members.map((m) => m.id);
          const myTasks = tasks.filter((t) => t.staff_id && memberIds.includes(t.staff_id));
          const isTeam = g.members.length > 1;
          return (
            <Card
              key={g.key}
              className={cn(
                'transition',
                dropTarget === g.key && 'border-blue-400 ring-2 ring-blue-200',
              )}
              onDragOver={(e: React.DragEvent) => {
                e.preventDefault();
                if (dropTarget !== g.key) setDropTarget(g.key);
              }}
              onDragLeave={() => setDropTarget((prev) => (prev === g.key ? null : prev))}
              onDrop={(e: React.DragEvent) => {
                e.preventDefault();
                handleDrop(g.primaryStaffId);
                setDropTarget(null);
              }}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>
                    {g.label}{' '}
                    {isTeam && <span className="text-xs font-normal text-blue-600">Team</span>}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      ({myTasks.length} Aufträge)
                    </span>
                  </CardTitle>
                  <div className="flex gap-1">
                    {g.members.map((m) => (
                      <Link
                        key={m.id}
                        href={`/api/cleaning/daily-pdf?date=${date}&staff_id=${m.id}`}
                        target="_blank"
                        title={`PDF für ${m.full_name}`}
                      >
                        <Button variant="secondary" size="sm">
                          <FileDown className="h-4 w-4" />
                          {isTeam ? m.full_name : 'PDF'}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardBody className="min-h-[120px] space-y-2">
                {myTasks.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Aufträge hier her ziehen, um sie zuzuweisen.
                  </p>
                ) : (
                  myTasks.map((t) => (
                    <DraggableTaskCard
                      key={t.id}
                      task={t}
                      isDragging={draggingId === t.id}
                      onDragStart={() => setDraggingId(t.id)}
                      onDragEnd={() => setDraggingId(null)}
                      compact
                    />
                  ))
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {pending && (
        <p className="text-xs text-slate-500">Speichere Zuweisung …</p>
      )}
    </div>
  );
}

function DraggableTaskCard({
  task,
  isDragging,
  onDragStart,
  onDragEnd,
  compact,
}: {
  task: DailyTask;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  compact: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group flex cursor-grab items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm transition hover:border-slate-300 active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-700" />
      <Link
        href={`/cleaning/${task.id}`}
        className="flex-1"
        onClick={(e) => {
          // beim Drag soll der Link nicht ausgelöst werden
          if (isDragging) e.preventDefault();
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span>
            {task.scheduled_time && <span className="font-medium">{task.scheduled_time} </span>}
            <span className="font-medium">{task.target}</span>
            <span className="text-slate-500"> · {TYPE_LABELS[task.type] ?? task.type}</span>
          </span>
          <Badge tone={STATUS_TONE[task.status as CleaningStatus]}>
            {cleaningStatusLabel[task.status as CleaningStatus]}
          </Badge>
        </div>
        {task.guest && !compact && (
          <div className="mt-0.5 text-xs text-slate-500">Gast: {task.guest}</div>
        )}
      </Link>
    </div>
  );
}

function DropZone({
  title,
  children,
  highlight,
  tone,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  title: string;
  children: React.ReactNode;
  highlight: boolean;
  tone: 'amber' | 'slate';
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}) {
  return (
    <Card
      className={cn(
        'transition',
        tone === 'amber' && 'border-amber-300 bg-amber-50/40',
        highlight && 'border-blue-400 ring-2 ring-blue-200',
      )}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault();
        onDragEnter();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <CardHeader>
        <CardTitle className={tone === 'amber' ? 'text-amber-700' : ''}>{title}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2">{children}</CardBody>
    </Card>
  );
}
