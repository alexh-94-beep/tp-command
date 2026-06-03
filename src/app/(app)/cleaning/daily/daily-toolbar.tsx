'use client';

import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addDaysIso, todayIso } from '@/lib/dates';

export default function DailyToolbar({ date }: { date: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(newDate: string) {
    const next = new URLSearchParams(sp.toString());
    next.set('date', newDate);
    const href = `/cleaning/daily?${next.toString()}` as Route;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => go(addDaysIso(date, -1))}
        disabled={pending}
        title="Tag zurück"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => go(todayIso())}
        disabled={pending}
      >
        <CalendarDays className="h-4 w-4" />
        Heute
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => go(addDaysIso(date, 1))}
        disabled={pending}
        title="Tag vor"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <input
        type="date"
        value={date}
        onChange={(e) => go(e.target.value)}
        className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
      />
    </div>
  );
}
