import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import type { ApartmentStatus, RentalType } from '@/types/aliases';

export interface ApartmentAvailability {
  id: string;
  number: string;
  building: string;
  type: string;
  standard_rent: number;
  short_term_flat_rate: number | null;
  allowed_rental_types: RentalType[];
  available: boolean;
  /** Falls nicht verfuegbar: kurze Begruendung fuer die UI */
  reason?: string;
  /** Falls Langzeit-Suche: bis wann die Wohnung frei ist (naechste Buchung) */
  free_until?: string;
}

// ── Pure helpers (testbar) ─────────────────────────────────────────────

/**
 * Excel-Spiegel-Daten als Pseudo-Buchung interpretieren. Reine Logik ohne DB:
 * korrigiert offensichtliche Excel-Inkonsistenzen (move_out vor move_in,
 * Status sagt belegt aber move_out in der Vergangenheit).
 */
export function computeMirrorConflict(input: {
  status: ApartmentStatus;
  current_move_in: string | null;
  current_move_out: string | null;
  today: string;
}): { applies: false } | { applies: true; start: string; end: string } {
  const hasMirror =
    input.status === 'occupied' ||
    input.status === 'terminated' ||
    input.status === 'contract_pending' ||
    input.status === 'booking_active';
  if (!hasMirror) return { applies: false };

  const start = input.current_move_in ?? '0001-01-01';
  let end = input.current_move_out ?? '9999-12-31';

  // move_out vor move_in -> move_out ignorieren
  if (input.current_move_in && input.current_move_out && end <= start) {
    end = '9999-12-31';
  }
  // Status sagt "noch belegt", aber move_out in der Vergangenheit (veraltete Excel-Daten)
  const stillActive =
    input.status === 'occupied' ||
    input.status === 'contract_pending' ||
    input.status === 'booking_active';
  if (input.current_move_out && end < input.today && stillActive) {
    end = '9999-12-31';
  }
  return { applies: true, start, end };
}

export function addYearsIso(iso: string, years: number): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// ── Service (DB-Orchestrator) ──────────────────────────────────────────

/**
 * Liefert alle Wohnungen (ausser extern verkaufte) inkl. Verfuegbarkeits-Info
 * fuer den gesuchten Zeitraum.
 *
 * - endDate gesetzt: Zwischennutzung moeglich – verfuegbar wenn keine
 *   geplante/aktive Buchung und kein Block in [startDate, endDate) ueberlappt.
 * - endDate fehlt: Langzeit – Wohnung muss ab startDate ohne Limit frei sein.
 *   Wir pruefen daher gegen ein open-ended-Fenster bis 10 Jahre.
 */
export async function findAvailableApartments(
  supabase: SupabaseClient<Database>,
  opts: {
    startDate: string;
    endDate?: string;
    ignoreBookingId?: string;
  },
): Promise<ApartmentAvailability[]> {
  const { startDate, ignoreBookingId } = opts;
  const isOpenEnded = !opts.endDate;
  const endDate = opts.endDate ?? addYearsIso(startDate, 10);

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
      .select(
        'id, apartment_id, start_date, end_date, status, rental_type, tenants!bookings_tenant_id_fkey(first_name, last_name)',
      )
      .in('status', ['planned', 'active'])
      .lt('start_date', endDate)
      .gt('end_date', startDate),
    supabase
      .from('blocks')
      .select('id, apartment_id, start_date, end_date, reason')
      .lt('start_date', endDate)
      .gt('end_date', startDate),
  ]);

  type ConflictEntry = { kind: 'booking' | 'block' | 'mirror'; start: string; end: string; label: string };
  const conflictByApt = new Map<string, ConflictEntry[]>();

  const push = (aptId: string, c: ConflictEntry) => {
    const arr = conflictByApt.get(aptId) ?? [];
    arr.push(c);
    conflictByApt.set(aptId, arr);
  };

  for (const b of bookings ?? []) {
    if (ignoreBookingId && b.id === ignoreBookingId) continue;
    const t = b.tenants;
    const name = t ? `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() : '';
    push(b.apartment_id, {
      kind: 'booking',
      start: b.start_date,
      end: b.end_date,
      label: name ? `${name} (${b.rental_type})` : `Buchung (${b.rental_type})`,
    });
  }
  for (const bl of blocks ?? []) {
    push(bl.apartment_id, {
      kind: 'block',
      start: bl.start_date,
      end: bl.end_date,
      label: bl.reason ? `Sperre: ${bl.reason}` : 'Sperre',
    });
  }

  // Excel-Spiegel-Konflikte
  const today = new Date().toISOString().slice(0, 10);
  for (const a of apartments ?? []) {
    const mirror = computeMirrorConflict({
      status: a.status,
      current_move_in: a.current_move_in,
      current_move_out: a.current_move_out,
      today,
    });
    if (!mirror.applies) continue;
    if (mirror.start < endDate && mirror.end > startDate) {
      const label = a.current_tenant_label ?? `Status: ${a.status}`;
      push(a.id, {
        kind: 'mirror',
        start: mirror.start,
        end: mirror.end,
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
      allowed_rental_types: a.allowed_rental_types,
    };
    const conflicts = conflictByApt.get(a.id) ?? [];
    if (conflicts.length === 0) {
      return { ...base, available: true };
    }

    conflicts.sort((x, y) => x.start.localeCompare(y.start));

    if (isOpenEnded) {
      const next = conflicts.find((c) => c.end > startDate);
      return {
        ...base,
        available: false,
        reason: next ? `belegt durch ${next.label}` : 'belegt',
        free_until: next?.start,
      };
    }

    return {
      ...base,
      available: false,
      reason: `${conflicts.length} Konflikt${conflicts.length > 1 ? 'e' : ''}: ${conflicts[0].label}`,
    };
  });
}
