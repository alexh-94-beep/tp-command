import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';

export const metadata = { title: 'Mieter & Gäste · TP-Command' };

export default function TenantsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mieter & Gäste"
        description="Mieter (Langzeit/Kurzzeit) und Gäste (Booking & Co.) in einer Liste."
      />
      <EmptyState
        title="Liste folgt in Phase 1"
        description="Filter nach tenant_kind, Suche nach Name/E-Mail, Zugriff auf historische Buchungen."
      />
    </div>
  );
}
