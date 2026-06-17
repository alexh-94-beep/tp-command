import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import ParkingImportForm from './form';

export const metadata = { title: 'Mieterspiegel importieren' };

export default async function ParkingImportPage() {
  await requireRole(['admin', 'office', 'management']);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={{ pathname: '/settings/parking' }}
          className="text-slate-500 hover:text-slate-700"
        >
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Parkplatz-Liste
          </span>
        </Link>
      </div>

      <PageHeader
        title="W&W-Mieterspiegel importieren"
        description="Lade den XLS-Export aus W&W hoch. Die Dauer-Mietverhältnisse werden im Tool aktualisiert. Booking-Belegungen werden nie überschrieben."
      />

      <ParkingImportForm />
    </div>
  );
}
