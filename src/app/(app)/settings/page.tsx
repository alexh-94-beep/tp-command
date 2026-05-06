import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';

export const metadata = { title: 'Einstellungen · TP-Command' };

export default async function SettingsPage() {
  await requireRole(['admin']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Einstellungen"
        description="Benutzer und Channels verwalten."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-medium">Benutzer</h2>
          <p className="mt-1 text-sm text-slate-500">
            Anlegen, Rolle ändern, deaktivieren. Folgt in Phase 1.
          </p>
        </div>
        <Link
          href="/settings/staff"
          className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm"
        >
          <h2 className="text-base font-medium">Reinigungsteam</h2>
          <p className="mt-1 text-sm text-slate-500">
            Operative Reinigungs-Personen verwalten (ohne App-Zugriff). Mireme weist hier zu.
          </p>
        </Link>
        <Link
          href="/settings/flatfox"
          className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm"
        >
          <h2 className="text-base font-medium">Flatfox-Test</h2>
          <p className="mt-1 text-sm text-slate-500">
            API-Token prüfen und Rohdaten von Flatfox anzeigen.
          </p>
        </Link>
        <Link
          href="/settings/channels"
          className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm"
        >
          <h2 className="text-base font-medium">Channels & iCal</h2>
          <p className="mt-1 text-sm text-slate-500">
            Booking.com, Airbnb und Expedia über iCal anbinden. Pull aktuell, Push als Feed pro Wohnung.
          </p>
        </Link>
      </div>
    </div>
  );
}
