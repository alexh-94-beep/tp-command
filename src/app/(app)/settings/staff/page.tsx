import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import StaffManager from './staff-manager';

export const metadata = { title: 'Reinigungs-Team' };

export default async function SettingsStaffPage() {
  await requireRole(['admin', 'office']);
  const supabase = await createSupabaseServerClient();

  const { data: staff } = await supabase
    .from('cleaning_staff')
    .select('id, full_name, email, phone, notes, is_active')
    .order('is_active', { ascending: false })
    .order('full_name', { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/settings" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zu den Einstellungen
          </span>
        </Link>
      </div>

      <PageHeader
        title="Reinigungs-Team"
        description="Operative Reinigungs-Personen (Nicole, Sevdale, Bide, Mireme). Diese haben keinen App-Zugriff – Mireme weist die Aufträge zu."
      />
      <StaffManager staff={staff ?? []} />
    </div>
  );
}
