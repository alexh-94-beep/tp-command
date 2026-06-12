'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AppRole } from '@/lib/auth/rbac';
import { filterForRole } from './nav-items';

/**
 * Mobile-Drawer-Navigation (< md). Hamburger-Button ueber den Inhalt
 * mit Slide-In-Drawer. Schliesst automatisch beim Pfad-Wechsel.
 */
export function MobileNav({
  role,
  userName,
  userRoleLabel,
}: {
  role: AppRole;
  userName: string;
  userRoleLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = filterForRole(role);

  // body-scroll lock waehrend Drawer offen
  // (Schliessen beim Routenwechsel passiert ueber onClick an den Links,
  // damit kein setState in useEffect noetig ist — React-19-Best-Practice.)
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 active:bg-slate-200"
          aria-label="Navigation öffnen"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link href="/dashboard" className="text-sm font-semibold tracking-tight">
          TP-Command
        </Link>

        <div className="text-right text-xs leading-tight">
          <div className="font-medium text-slate-900">{userName}</div>
          <div className="text-[10px] text-slate-500">{userRoleLabel}</div>
        </div>
      </header>

      {/* Drawer + Backdrop */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl md:hidden">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <Link
                href="/dashboard"
                className="text-base font-semibold tracking-tight"
              >
                TP-Command
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 active:bg-slate-200"
                aria-label="Schließen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {items.map(({ label, href, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={{ pathname: href }}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex h-12 items-center gap-3 rounded-md px-3 text-base transition',
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-800 hover:bg-slate-100 active:bg-slate-200',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-slate-200 p-3">
              <div className="mb-2 px-3 text-xs text-slate-500">
                <div className="font-medium text-slate-900">{userName}</div>
                <div className="text-[11px]">{userRoleLabel}</div>
              </div>
              <form action="/auth/logout" method="post">
                <button
                  type="submit"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-slate-200 text-sm text-slate-700 hover:bg-slate-100"
                >
                  <LogOut className="h-4 w-4" />
                  Abmelden
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
