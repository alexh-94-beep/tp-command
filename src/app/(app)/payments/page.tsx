import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';

export const metadata = { title: 'Zahlungen · TP-Command' };

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Zahlungen"
        description="Übersicht über offene und bezahlte Beträge mit Ampellogik. Wird in Phase 2 ausgebaut."
      />
      <EmptyState
        title="Zahlungs-Modul folgt in Phase 2"
        description="Pro Buchung: Miete, Depot, Kurzzeit-Pauschale, Parking, Booking-Auszahlung."
      />
    </div>
  );
}
