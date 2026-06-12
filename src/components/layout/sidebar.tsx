'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { AppRole } from '@/lib/auth/rbac';
import { filterForRole } from './nav-items';

/**
 * Desktop-Sidebar (>= md). Auf mobile wird sie versteckt — dort uebernimmt
 * MobileNav (Drawer + Hamburger).
 */
export function Sidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const ready = filterForRole(role);

  return (
    <aside className="hidden h-screen w-60 flex-col border-r border-slate-200 bg-white md:flex">
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
              href={{ pathname: href }}
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
      </nav>
    </aside>
  );
}
