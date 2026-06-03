import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { PageHeader } from '@/components/shared/page-header';
import NewPendingForm from './new-form';

export const metadata = { title: 'Neue Pool-Reservation' };

export default async function NewPendingPage() {
  await requireRole(['admin', 'office']);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/bookings/pending" className="text-slate-500 hover:text-slate-700">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zurück zu Pool-Reservationen
          </span>
        </Link>
      </div>

      <PageHeader
        title="Neue Pool-Reservation"
        description="Trage hier eine über Booking.com (oder andere Kanäle) eingehende Reservation ein. Wird im Eingang gesammelt, bis Office einer Wohnung zuweist."
      />

      <NewPendingForm />
    </div>
  );
}
