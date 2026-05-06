import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dates';
import { apartmentStatusLabel, apartmentStatusTone } from '@/lib/labels';
import type { Apartment } from '@/types/db';

/**
 * Stellt das Mieter-Label dar.
 * Bei Booking-Wohnungen wird "Booking · …" vorangestellt.
 */
function tenantDisplay(a: Pick<Apartment, 'current_tenant_label' | 'status'>): string {
  const raw = (a.current_tenant_label ?? '').trim();
  const isBooking =
    a.status === 'booking_active' || raw.toLowerCase().startsWith('booking');

  if (isBooking) {
    // "Booking" entfernen falls schon im Text, dann sauber neu prefixen
    const cleaned = raw.replace(/^booking[\s:·\-/]*/i, '').trim();
    return cleaned ? `Booking · ${cleaned}` : 'Booking';
  }
  return raw || '–';
}

interface Row
  extends Pick<
    Apartment,
    'id' | 'number' | 'building' | 'status' | 'current_tenant_label' | 'current_move_in' | 'current_move_out'
  > {}

export function OccupancyTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-700">Aktuelle Belegung</h2>
        <p className="text-xs text-slate-500">{rows.length} Wohnungen mit Mietern oder Buchungen</p>
      </div>
      <div className="max-h-[600px] overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Wohnung</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Mieter / Gast</th>
              <th className="whitespace-nowrap px-4 py-2">Einzug</th>
              <th className="whitespace-nowrap px-4 py-2">Auszug</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-2 font-medium">
                  <Link href={`/apartments/${r.id}`} className="hover:underline">
                    {r.number}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <Badge tone={apartmentStatusTone[r.status]}>
                    {apartmentStatusLabel[r.status]}
                  </Badge>
                </td>
                <td className="px-4 py-2">{tenantDisplay(r)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                  {r.current_move_in ? formatDate(r.current_move_in) : '–'}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                  {r.current_move_out ? formatDate(r.current_move_out) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
