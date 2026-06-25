import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';
import { estimateDurationMinutes } from './duration';

/**
 * Phase 25b: Wenn der Workflow-Task "schedule_handover_deep_cleaning"
 * abgehakt wird, legen wir automatisch einen cleaning_task vom Typ
 * 'deep_clean' fuer den Tag nach dem Auszug an.
 *
 * Idempotent: existiert schon ein deep_clean fuer die Wohnung am selben
 * Datum, wird kein neuer angelegt.
 *
 * Returns die ID des neuen cleaning_tasks oder null wenn nichts angelegt.
 */
export async function autoCreateHandoverDeepClean(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  actorId: string | null,
): Promise<string | null> {
  const { data: booking } = await supabase
    .from('bookings')
    .select(
      'id, apartment_id, end_date, notes, apartment:apartments(type), tenant:tenants!bookings_tenant_id_fkey(first_name, last_name)',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) return null;

  // Tag nach Check-out
  const out = new Date(`${booking.end_date}T12:00:00Z`);
  out.setUTCDate(out.getUTCDate() + 1);
  const scheduledDate = out.toISOString().slice(0, 10);

  // Idempotenz: schon ein deep_clean an dem Tag fuer die Wohnung?
  const { data: existing } = await supabase
    .from('cleaning_tasks')
    .select('id')
    .eq('apartment_id', booking.apartment_id)
    .eq('scheduled_date', scheduledDate)
    .eq('type', 'deep_clean')
    .maybeSingle();
  if (existing) return existing.id;

  const apartmentType = booking.apartment?.type ?? 'senior';
  const duration = estimateDurationMinutes(
    'cityus',
    apartmentType,
    'deep_clean',
  );

  const { data: created, error } = await supabase
    .from('cleaning_tasks')
    .insert({
      apartment_id: booking.apartment_id,
      scheduled_date: scheduledDate,
      type: 'deep_clean',
      priority: 'normal',
      status: 'open',
      estimated_duration_minutes: duration,
      linen_change: true,
      source: 'workflow',
      notes: buildHandoverDeepCleanNotes(booking),
    })
    .select('id')
    .single();
  if (error) return null;

  void (async () => {
    const { logAudit } = await import('@/services/audit/log');
    await logAudit(supabase, {
      actorId,
      entity: 'cleaning_task',
      entityId: created.id,
      action: 'created',
      diff: {
        type: 'deep_clean',
        scheduled_date: scheduledDate,
        apartment_id: booking.apartment_id,
        source: 'workflow:schedule_handover_deep_cleaning',
      },
      note: 'Wohnungsabnahmereinigung automatisch aus Workflow erstellt',
    });
  })();

  return created.id;
}

function buildHandoverDeepCleanNotes(booking: {
  notes: string | null;
  tenant: { first_name: string | null; last_name: string | null } | null;
}): string {
  const guestName =
    [booking.tenant?.first_name, booking.tenant?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || null;
  const header = guestName
    ? `Wohnungsabnahmereinigung (Langzeit-Auszug) — ${guestName}.`
    : 'Wohnungsabnahmereinigung (Langzeit-Auszug).';
  const lines = [header, 'Automatisch erstellt aus Workflow-Aufgabe.'];
  const bookingNote = (booking.notes ?? '').trim();
  if (bookingNote) lines.push('', 'Notiz aus Buchung:', bookingNote);
  return lines.join('\n');
}
