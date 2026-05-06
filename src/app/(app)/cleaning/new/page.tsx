import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import NewCleaningTaskForm from './new-form';

export const metadata = { title: 'Neuer Reinigungsauftrag · TP-Command' };

export default async function NewCleaningPage() {
  await requireRole(['admin', 'office']);

  const supabase = createSupabaseServerClient();
  const [{ data: apartments }, { data: externals }, { data: cleaners }] = await Promise.all([
    supabase
      .from('apartments')
      .select('id, number')
      .neq('ownership', 'sold_external')
      .order('number'),
    supabase.from('external_apartments').select('id, label').eq('is_active', true).order('label'),
    supabase
      .from('cleaning_staff')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name'),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/cleaning" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Liste
          </span>
        </Link>
      </div>

      <PageHeader
        title="Neuer Reinigungsauftrag"
        description="Spezial-Aufträge, einmalige Endreinigungen oder externe Wohnungen."
      />

      <NewCleaningTaskForm
        apartments={apartments ?? []}
        externals={externals ?? []}
        cleaners={cleaners ?? []}
      />
    </div>
  );
}
