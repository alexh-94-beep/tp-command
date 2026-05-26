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

interface ReadyNavItem {
  label: string;
  href: '/dashboard' | '/apartments' | '/calendar' | '/bookings' | '/tenants';
  icon: IconType;
  roles?: AppRole[];
}

const READY: ReadyNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Wohnungen', href: '/apartments', icon: Home },
  { label: 'Belegung', href: '/calendar', icon: Calendar },
  { label: 'Buchungen', href: '/bookings', icon: BookOpen },
  { label: 'Mieter & Gäste', href: '/tenants', icon: Users },
];

/**
 * Die übrigen Module sind als deaktivierte Einträge sichtbar (Roadmap)
 * und werden pro Phase in das READY-Array überführt, sobald die Routen
 * gebaut sind.
 */
const UPCOMING: { label: string; icon: IconType; roles?: AppRole[] }[] = [
  { label: 'Aufgaben', icon: ListChecks, roles: ['admin', 'office'] },
  { label: 'Reinigung', icon: Sparkles },
  { label: 'Zahlungen', icon: CreditCard, roles: ['admin', 'office', 'management'] },
  { label: 'Einstellungen', icon: Settings, roles: ['admin'] },
];

export function Sidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const ready = READY.filter((i) => !i.roles || i.roles.includes(role));
  const upcoming = UPCOMING.filter((i) => !i.roles || i.roles.includes(role));

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-4">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight">
          TP-Command
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-4">
        {ready.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}

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
