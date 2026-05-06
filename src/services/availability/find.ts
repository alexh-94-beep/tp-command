import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { RentalType } from '@/types/db';

export interface ApartmentAvailability {
  id: string;
  number: string;
  building: string;
  type: string;
  standard_rent: number;
  short_term_flat_rate: number | null;
  allowed_rental_types: RentalType[];
  available: boolean;
  /** Falls nicht verfügbar: kurze Begründung für die UI */
  reason?: string;
  /** Falls Langzeit-Suche: bis wann die Wohnung frei ist (nächste Buchung) */
  free_until?: string;
}

/**
 * Liefert alle Wohnungen (ausser extern verkaufte) inkl. Verfügbarkeits-Info
 * für den gesuchten Zeitraum.
 *
 * Semantik:
 *  - endDate gesetzt: Zwischennutzung möglich – Wohnung ist verfügbar, wenn
 *    keine geplante/aktive Buchung und kein Block in [startDate, endDate)
 *    überlappt.
 *  - endDate NICHT gesetzt: Langzeit – Wohnung muss ab startDate ohne Limit
 *    frei sein. Wir prüfen daher gegen ein "open-ended"-Fenster bis weit
 *    in die Zukunft (10 Jahre).
 */
export async function findAvailableApartments(opts: {
  startDate: string;
  endDate?: string;
  ignoreBookingId?: string;
}): Promise<ApartmentAvailability[]> {
  const { startDate, ignoreBookingId } = opts;
  const isOpenEnded = !opts.endDate;

  // Effektives endDate für die Konflikt-Suche
  const endDate =
    opts.endDate ?? addYearsIso(startDate, 10);

  const supabase = createSupabaseServerClient();

  const [{ data: apartments }, { data: bookings }, { data: blocks }] = await Promise.all([
    supabase
      .from('apartments')
      .select(
        'id, number, building, type, standard_rent, short_term_flat_rate, allowed_rental_types, status, current_tenant_label, current_move_in, current_move_out',
      )
      .neq('ownership', 'sold_external')
      .order('number'),
    supabase
      .from('bookings')
      .select('id, apartment_id, start_date, end_date, status, rental_type, tenants!bookings_tenant_id_fkey(first_name, last_name)')
      .in('status', ['planned', 'active'])
      .lt('start_date', endDate)
      .gt('end_date', startDate),
    supabase
      .from('blocks')
      .select('id, apartment_id, start_date, end_date, reason')
      .lt('start_date', endDate)
      .gt('end_date', startDate),
  ]);

  // Konflikte je Wohnung sammeln
  const conflictByApt = new Map<
    string,
    Array<{ kind: 'booking' | 'block' | 'mirror'; start: string; end: string; label: string }>
  >();

  for (const b of bookings ?? []) {
    if (ignoreBookingId && b.id === ignoreBookingId) continue;
    const t = b.tenants as { first_name?: string; last_name?: string } | null;
    const name = t ? `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() : '';
    push(conflictByApt, b.apartment_id, {
      kind: 'booking',
      start: b.start_date,
      end: b.end_date,
      label: name ? `${name} (${b.rental_type})` : `Buchung (${b.rental_type})`,
    });
  }
  for (const bl of blocks ?? []) {
    push(conflictByApt, bl.apartment_id, {
      kind: 'block',
      start: bl.start_date,
      end: bl.end_date,
      label: bl.reason ? `Sperre: ${bl.reason}` : 'Sperre',
    });
  }

  // ---- Spiegel-Daten (Excel) als Pseudo-Buchung berücksichtigen ----
  // Solange wir noch keine echten Buchungen aus der Excel migriert haben,
  // verwenden wir current_tenant_label/move_in/move_out, damit die
  // Verfügbarkeit nicht "alle frei" zurückliefert.
  const today = new Date().toISOString().slice(0, 10);
  for (const a of apartments ?? []) {
    // Wir verlassen uns auf den STATUS, nicht auf das Mieter-Label.
    // Das Mieter-Feld kann auch Notizen enthalten ("Putzraum - Kontrolle"),
    // dann ist die Wohnung trotzdem verfügbar.
    const hasMirror =
      a.status === 'occupied' ||
      a.status === 'terminated' ||
      a.status === 'contract_pending' ||
      a.status === 'booking_active';
    if (!hasMirror) continue;

    let pStart: string = a.current_move_in ?? '0001-01-01';
    let pEnd: string = a.current_move_out ?? '9999-12-31';

    // --- Datenfehler-Schutz ---
    // Inkonsistenz 1: move_out vor move_in → move_out ignorieren
    if (a.current_move_in && a.current_move_out && pEnd <= pStart) {
      pEnd = '9999-12-31';
    }
    // Inkonsistenz 2: Status sagt "noch belegt", aber move_out liegt in der
    //   Vergangenheit (= veraltete Daten in Excel). Wir nehmen open-end an.
    if (
      a.current_move_out &&
      pEnd < today &&
      (a.status === 'occupied' ||
        a.status === 'contract_pending' ||
        a.status === 'booking_active')
    ) {
      pEnd = '9999-12-31';
    }

    // Überlappt sie mit unserem Suchfenster?
    if (pStart < endDate && pEnd > startDate) {
      const label = a.current_tenant_label ?? `Status: ${a.status}`;
      push(conflictByApt, a.id, {
        kind: 'mirror',
        start: pStart,
        end: pEnd,
        label: `Excel: ${label}`,
      });
    }
  }

  return (apartments ?? []).map((a) => {
    const base = {
      id: a.id,
      number: a.number,
      building: a.building,
      type: a.type,
      standard_rent: a.standard_rent,
      short_term_flat_rate: a.short_term_flat_rate,
      allowed_rental_types: a.allowed_rental_types as RentalType[],
    };
    const conflicts = conflictByApt.get(a.id) ?? [];
    if (conflicts.length === 0) {
      return { ...base, available: true } as ApartmentAvailability;
    }

    conflicts.sort((x, y) => x.start.localeCompare(y.start));

    if (isOpenEnded) {
      const next = conflicts.find((c) => c.end > startDate);
      return {
        ...base,
        available: false,
        reason: next ? `belegt durch ${next.label}` : 'belegt',
        free_until: next?.start,
      } as ApartmentAvailability;
    }

    return {
      ...base,
      available: false,
      reason: `${conflicts.length} Konflikt${conflicts.length > 1 ? 'e' : ''}: ${conflicts[0].label}`,
    } as ApartmentAvailability;
  });
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key) ?? [];
  arr.push(value);
  map.set(key, arr);
}

function addYearsIso(iso: string, years: number): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}
