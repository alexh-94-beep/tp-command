import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import FlatfoxTester from './flatfox-tester';

export const metadata = { title: 'Flatfox-Test · TP-Command' };

export default async function FlatfoxTestPage() {
  await requireRole(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Flatfox-API testen"
        description="Prüft, ob der API-Token funktioniert und welche Daten Flatfox liefert. Dient als Grundlage für die spätere automatische Übernahme."
      />
      <FlatfoxTester />
    </div>
  );
}
