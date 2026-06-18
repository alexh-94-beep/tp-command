import Link from 'next/link';
import type { AppUser } from '@/lib/auth/session';

const roleLabel: Record<AppUser['role'], string> = {
  admin: 'Admin',
  office: 'Office',
  cleaning: 'Reinigung',
  management: 'Management',
};

/**
 * Desktop-Topbar (>= md). Auf mobile wird sie versteckt — dort uebernimmt
 * MobileNav den Header inkl. Hamburger.
 */
export function Topbar({ user }: { user: AppUser }) {
  return (
    <header className="hidden h-14 items-center justify-between border-b border-slate-200 bg-white px-6 md:flex">
      <div className="text-sm text-slate-500">TP-Command – internes Betriebssystem</div>

      <div className="flex items-center gap-4">
        <Link
          href={{ pathname: '/account' }}
          className="text-right text-sm leading-tight hover:opacity-80"
          title="Mein Konto / Passwort ändern"
        >
          <div className="font-medium text-slate-900">{user.fullName}</div>
          <div className="text-xs text-slate-500">{roleLabel[user.role]}</div>
        </Link>
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
          >
            Abmelden
          </button>
        </form>
      </div>
    </header>
  );
}
