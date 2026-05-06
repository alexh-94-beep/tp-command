import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import CityusImportWizard from './cityus-import-wizard';

export const metadata = { title: 'Cityus-Wochenplan importieren · TP-Command' };

export default async function CityusImportPage() {
  await requireRole(['admin', 'office']);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/cleaning" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Reinigung
          </span>
        </Link>
      </div>

      <PageHeader
        title="Cityus-Wochenplan importieren"
        description="Lade den Cityus-Cleaning-Plan für die Woche hoch. Wir legen Sub-Aufenthalte und automatisch alle Reinigungs-Aufträge an. Spätere Re-Imports updaten geänderte Einträge."
      />

      <CityusImportWizard />
    </div>
  );
}
