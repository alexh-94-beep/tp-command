'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Home,
  Calendar,
  BookOpen,
  Sparkles,
  CreditCard,
  Users,
  Settings,
  ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AppRole } from '@/lib/auth/rbac';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: AppRole[];
}

const items: NavItem[] = [
  { label: 'Dashboard',     href: '/dashboard',  icon: LayoutDashboard },
  { label: 'Wohnungen',     href: '/apartments', icon: Home },
  { label: 'Belegung',      href: '/calendar',   icon: Calendar },
  { label: 'Buchungen',     href: '/bookings',   icon: BookOpen },
  { label: 'Aufgaben',      href: '/tasks',      icon: ListChecks, roles: ['admin', 'office'] },
  { label: 'Reinigung',     href: '/cleaning',   icon: Sparkles },
  { label: 'Zahlungen',     href: '/payments',   icon: CreditCard, roles: ['admin', 'office', 'management'] },
  { label: 'Mieter & Gäste',href: '/tenants',    icon: Users },
  { label: 'Einstellungen', href: '/settings',   icon: Settings,  roles: ['admin'] },
];

export function Sidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();

  const visible = items.filter((i) => !i.roles || i.roles.includes(role));

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-4">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight">
          TP-Command
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 pb-4">
        {visible.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
