/**
 * Audit-Log: wer hat wann was geaendert.
 *
 * Schreibt Eintraege in die audit_log-Tabelle. Pro Server-Action wird
 * idealerweise EIN Eintrag erzeugt. RLS erlaubt Insert fuer jeden
 * authentifizierten User, Read nur fuer admin.
 *
 * Pure helpers (computeDiff, isInterestingDiff) sind getrennt damit
 * sie per Vitest testbar bleiben.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';

// ── Konstanten ────────────────────────────────────────────────────────

export const AUDIT_ENTITIES = [
  'booking',
  'booking_task',
  'cleaning_task',
  'standalone_task',
  'debitor_invoice',
  'apartment',
  'apartment_damage',
  'pending_reservation',
  'external_owner',
  'parking_spot',
  'parking_assignment',
  'user',
] as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ACTIONS = [
  'created',
  'updated',
  'status_changed',
  'assigned',
  'cancelled',
  'deleted',
  'finalized',
  'invoiced',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// ── Pure helpers ──────────────────────────────────────────────────────

/**
 * Berechnet einen schlanken Diff zwischen zwei Objekten.
 * Liefert nur die Felder, die sich tatsaechlich geaendert haben,
 * jeweils mit before/after.
 *
 * - Wert-Gleichheit per Deep-Equal (JSON.stringify) — genuegt fuer die
 *   primitiven + flachen Strukturen in der App.
 * - undefined- und ungeaenderte Felder werden weggelassen.
 */
export function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (a === b) continue;
    if (a === undefined && b === undefined) continue;
    // JSON-Stringify-Vergleich fuer Objekte/Arrays
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    diff[k] = { before: a, after: b };
  }
  return diff;
}

/** Diff ist "interessant" wenn er mindestens ein Feld enthaelt. */
export function isInterestingDiff(
  diff: Record<string, { before: unknown; after: unknown }>,
): boolean {
  return Object.keys(diff).length > 0;
}

// ── Writer ────────────────────────────────────────────────────────────

export interface AuditEntryInput {
  actorId: string | null;
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  diff?: Record<string, unknown>;
  /** Optional: kurze, menschenlesbare Notiz; landet im diff unter `_note`. */
  note?: string;
}

/**
 * Schreibt einen Audit-Eintrag. Fehler werden nur geloggt — sie sollen
 * NIE die eigentliche Aktion blockieren. Der Caller verwendet das
 * idealerweise mit `void logAudit(...)` oder ignoriert das Ergebnis.
 */
export async function logAudit(
  supabase: SupabaseClient<Database>,
  input: AuditEntryInput,
): Promise<{ ok: boolean }> {
  const diff = { ...(input.diff ?? {}) };
  if (input.note) diff._note = input.note;
  try {
    const { error } = await supabase.from('audit_log').insert({
      actor_id: input.actorId,
      entity_type: input.entity,
      entity_id: input.entityId,
      action: input.action,
      // Jsonb-Cast: TS-Generic erlaubt nur Json — Record<string,unknown> ist
      // semantisch kompatibel, hier explizit casten.
      diff: Object.keys(diff).length > 0 ? (diff as never) : null,
    });
    if (error) {
      console.error('[audit] insert failed:', error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error('[audit] threw:', e);
    return { ok: false };
  }
}

/**
 * Kuerzer: Audit-Eintrag fuer "updated"-Aktionen, ueberspringt automatisch
 * wenn der Diff leer ist.
 */
export async function logAuditUpdate(
  supabase: SupabaseClient<Database>,
  args: {
    actorId: string | null;
    entity: AuditEntity;
    entityId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    action?: AuditAction;
  },
): Promise<{ ok: boolean; skipped?: boolean }> {
  const diff = computeDiff(args.before, args.after);
  if (!isInterestingDiff(diff)) return { ok: true, skipped: true };
  const r = await logAudit(supabase, {
    actorId: args.actorId,
    entity: args.entity,
    entityId: args.entityId,
    action: args.action ?? 'updated',
    diff,
  });
  return { ok: r.ok };
}
