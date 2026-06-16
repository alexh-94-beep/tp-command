import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import ExternalOwnersList, {
  type OwnerWithApartments,
} from './owners-list';

export const metadata = { title: 'Externe Eigentümer' };
export const dynamic = 'force-dynamic';

export default async function ExternalOwnersPage() {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();

  const { data: ownersRaw } = await supabase
    .from('external_owners')
    .select(
      'id, name, contact_phone, contact_email, address, notes, is_active, external_apartments:external_apartments!external_apartments_owner_id_fkey(id, label, address)',
    )
    .order('name');

  const owners: OwnerWithApartments[] = (ownersRaw ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    contact_phone: o.contact_phone,
    contact_email: o.contact_email,
    address: o.address,
    notes: o.notes,
    is_active: o.is_active,
    apartments: (o.external_apartments ?? []).map((a) => ({
      id: a.id,
      label: a.label,
      address: a.address,
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href={{ pathname: '/settings' }} className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zu Einstellungen
          </span>
        </Link>
      </div>
      <PageHeader
        title="Externe Eigentümer"
        description="Pflegt Eigentümer und ihre Wohnungen, für die wir Reinigungen ausführen. Ein Eigentümer kann mehrere Wohnungen haben."
      />
      <ExternalOwnersList owners={owners} />
    </div>
  );
}
