'use client';

import { useTransition } from 'react';
import { Check } from 'lucide-react';
import { setTaskStatus } from '@/server/workflow/actions';
import type { BookingTaskStatus } from '@/types/aliases';

export default function TaskQuickComplete({
  taskId,
  currentStatus,
}: {
  taskId: string;
  currentStatus: BookingTaskStatus;
}) {
  const [pending, startTransition] = useTransition();
  const isDone = currentStatus === 'done';

  function toggle() {
    startTransition(async () => {
      await setTaskStatus(taskId, isDone ? 'open' : 'done');
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || currentStatus === 'na' || currentStatus === 'skipped'}
      className={`flex h-5 w-5 items-center justify-center rounded border transition ${
        isDone
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-slate-300 bg-white hover:border-slate-500'
      } disabled:cursor-not-allowed disabled:opacity-40`}
      aria-label={isDone ? 'Erledigt aufheben' : 'Als erledigt markieren'}
    >
      {isDone && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}
