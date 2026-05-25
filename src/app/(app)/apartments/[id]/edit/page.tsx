import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import EditApartmentForm from './edit-form';

export const metadata = { title: 'Wohnung bearbeiten' };

export default async function EditApartmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['admin', 'office']);

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: apartment } = await supabase
    .from('apartments')
    .select('*')
    .eq('id', id)
    .single();

  if (!apartment) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={`/apartments/${apartment.id}`}
          className="text-slate-500 hover:text-slate-700"
        >
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Wohnung
          </span>
        </Link>
      </div>

      <PageHeader
        title={`Wohnung ${apartment.number} bearbeiten`}
        description="Wohnungsnummer und Gebäude können nach dem Anlegen nicht geändert werden."
      />

      <EditApartmentForm apartment={apartment} />
    </div>
  );
}
