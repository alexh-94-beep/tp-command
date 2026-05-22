'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Home,
  Calendar,
  BookOpen,
  ListChecks,
  Sparkles,
  CreditCard,
  Users,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AppRole } from '@/lib/auth/rbac';

type IconType = React.ComponentType<{ className?: string }>;

/**
 * Phase 0: nur das Dashboard ist gebaut. Die übrigen Module sind als
 * deaktivierte Einträge sichtbar (Roadmap-Vorschau) und werden pro Phase
 * zu echten <Link>s — typedRoutes akzeptiert nur existierende Routen.
 */
const UPCOMING: { label: string; icon: IconType; roles?: AppRole[] }[] = [
  { label: 'Wohnungen', icon: Home },
  { label: 'Belegung', icon: Calendar },
  { label: 'Buchungen', icon: BookOpen },
  { label: 'Aufgaben', icon: ListChecks, roles: ['admin', 'office'] },
  { label: 'Reinigung', icon: Sparkles },
  { label: 'Zahlungen', icon: CreditCard, roles: ['admin', 'office', 'management'] },
  { label: 'Mieter & Gäste', icon: Users },
  { label: 'Einstellungen', icon: Settings, roles: ['admin'] },
];

export function Sidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const dashboardActive = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const upcoming = UPCOMING.filter((i) => !i.roles || i.roles.includes(role));

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-4">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight">
          TP-Command
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-4">
        <Link
          href="/dashboard"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
            dashboardActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>

        <div className="px-3 pt-4 pb-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
          In Arbeit
        </div>
        {upcoming.map(({ label, icon: Icon }) => (
          <div
            key={label}
            aria-disabled
            title="Folgt in einer späteren Phase"
            className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300"
          >
            <Icon className="h-4 w-4" />
            {label}
          </div>
        ))}
      </nav>
    </aside>
  );
}
