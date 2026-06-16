import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';

export const metadata = { title: 'Einstellungen' };

export default async function SettingsPage() {
  await requireRole(['admin']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Einstellungen"
        description="Channel-Anbindungen und Team. Module werden pro Phase aktiviert."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/settings/flatfox"
          className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm"
        >
          <h2 className="text-base font-medium">Flatfox</h2>
          <p className="mt-1 text-sm text-slate-500">
            API-Token prüfen, Live-Anmeldungen sichten und ZIP-Dossiers inspizieren.
          </p>
        </Link>

        <Link
          href="/settings/staff"
          className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm"
        >
          <h2 className="text-base font-medium">Reinigungsteam</h2>
          <p className="mt-1 text-sm text-slate-500">
            Operative Reinigungs-Personen verwalten (Nicole, Sevdale, Bide, Mireme). Kein App-Zugriff.
          </p>
        </Link>

        <Link
          href={{ pathname: '/settings/external-owners' }}
          className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm"
        >
          <h2 className="text-base font-medium">Externe Eigentümer</h2>
          <p className="mt-1 text-sm text-slate-500">
            Stammdaten der Eigentümer und ihrer Wohnungen pflegen.
          </p>
        </Link>

        <Link
          href={{ pathname: '/settings/audit' }}
          className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm"
        >
          <h2 className="text-base font-medium">Audit-Log</h2>
          <p className="mt-1 text-sm text-slate-500">
            Wer hat wann was geändert — Buchungen, Aufgaben, Rechnungen, Reinigungen.
          </p>
        </Link>

        <div
          aria-disabled
          title="Folgt in einer späteren Phase"
          className="cursor-not-allowed rounded-xl border border-dashed border-slate-200 bg-white p-6"
        >
          <h2 className="text-base font-medium text-slate-400">
            Channels &amp; iCal <span className="text-xs">(Phase 6)</span>
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Booking.com, Airbnb und Expedia über iCal anbinden.
          </p>
        </div>

        <div
          aria-disabled
          title="Folgt in einer späteren Phase"
          className="cursor-not-allowed rounded-xl border border-dashed border-slate-200 bg-white p-6"
        >
          <h2 className="text-base font-medium text-slate-400">Benutzer</h2>
          <p className="mt-1 text-sm text-slate-400">
            User-Verwaltung läuft aktuell direkt im Supabase-Dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
