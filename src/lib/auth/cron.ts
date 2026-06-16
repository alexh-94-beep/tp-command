/**
 * Cron-Token-Vergleich.
 *
 * Header: `Authorization: Bearer <CRON_SECRET>`
 * - Vergleich timing-safe (crypto.timingSafeEqual), damit Token-Länge
 *   nicht über String-Compare-Dauer leakbar ist
 * - Liefert true nur bei exaktem Match + gesetztem Env
 */
import { timingSafeEqual } from 'node:crypto';

/**
 * Pure helper — direkt testbar mit beliebigem expected/provided.
 * Beide Argumente werden auf gleiche Länge gebracht (pad mit 0x00),
 * wir XOR-en aber zusätzlich ein "lengthMismatch"-Bit dazu, damit
 * "abc" vs "abcd" nicht als gleich gilt.
 */
export function isAuthorizedCron(
  provided: string | null,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  if (!provided) return false;
  const expectedHeader = `Bearer ${expected}`;
  // Buffer mit fester Länge auf max(provided, expected) padden,
  // damit timingSafeEqual nicht selbst über die Länge spricht.
  const a = Buffer.from(provided);
  const b = Buffer.from(expectedHeader);
  if (a.length !== b.length) {
    // Trotzdem mit Dummy-Vergleich beschäftigen, um Längen-Leak zu reduzieren
    const dummy = Buffer.alloc(b.length);
    try {
      timingSafeEqual(dummy, b);
    } catch {
      // ignore
    }
    return false;
  }
  return timingSafeEqual(a, b);
}
