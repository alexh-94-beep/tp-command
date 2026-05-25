import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import ImportWizard from './import-wizard';

export const metadata = { title: 'Wohnungen importieren' };

export default async function ApartmentImportPage() {
  await requireRole(['admin', 'office']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wohnungen aus Excel importieren"
        description="Lädt das Sheet 'Overview Apartments (2)' aus der Mietzinsspiegel-Liste und legt die Wohnungen an. Bestehende Wohnungen werden je nach Modus übersprungen oder aktualisiert."
      />
      <ImportWizard />
    </div>
  );
}
