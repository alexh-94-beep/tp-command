'use client';

import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addDaysIso, mondayOfWeekIso, todayIso } from '@/lib/dates';

export default function WeeklyToolbar({ weekStart }: { weekStart: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(week: string) {
    const next = new URLSearchParams(sp.toString());
    next.set('week', week);
    const href = `/cleaning/weekly?${next.toString()}` as Route;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => go(addDaysIso(weekStart, -7))}
        disabled={pending}
      >
        <ChevronLeft className="h-4 w-4" />
        Vorwoche
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => go(mondayOfWeekIso(todayIso()))}
        disabled={pending}
      >
        <CalendarDays className="h-4 w-4" />
        Diese Woche
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => go(addDaysIso(weekStart, 7))}
        disabled={pending}
      >
        Nächste Woche
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
