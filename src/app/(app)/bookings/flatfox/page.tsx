import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import FlatfoxImportList from './flatfox-import-list';

export const metadata = { title: 'Flatfox-Anmeldungen · TP-Command' };

export default async function FlatfoxApplicationsPage() {
  await requireRole(['admin', 'office']);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/bookings" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zu Buchungen
          </span>
        </Link>
      </div>

      <PageHeader
        title="Anmeldungen aus Flatfox"
        description="Live-Liste der Anmeldungen aus Flatfox. Mit einem Klick werden Mieter + Buchung angelegt und Anmeldeformular und Dokumente als Anhänge gespeichert."
      />

      <FlatfoxImportList />
    </div>
  );
}
