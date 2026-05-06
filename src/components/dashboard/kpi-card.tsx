import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface KpiCardProps {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
}

const toneStyles: Record<NonNullable<KpiCardProps['tone']>, string> = {
  neutral: 'bg-white border-slate-200',
  warning: 'bg-amber-50 border-amber-200',
  danger:  'bg-red-50 border-red-200',
  success: 'bg-emerald-50 border-emerald-200',
};

export function KpiCard({ label, value, hint, icon: Icon, tone = 'neutral' }: KpiCardProps) {
  return (
    <div className={cn('rounded-xl border p-4 shadow-sm', toneStyles[tone])}>
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
