import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import FlatfoxImportWizard from './flatfox-import-wizard';

export const metadata = { title: 'Flatfox-Anmeldung importieren · TP-Command' };

export default async function FlatfoxImportPage() {
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
        title="Anmeldung aus Flatfox importieren"
        description="Lade die Zusammenfassungs-PDF aus Flatfox hoch. Wir parsen Wohnung, alle Bewerber und legen Mieter + Buchung an."
      />

      <FlatfoxImportWizard />
    </div>
  );
}
