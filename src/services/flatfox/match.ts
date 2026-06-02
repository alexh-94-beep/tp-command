/**
 * Pure Helpers fuer das Mapping Flatfox-Listing -> interne Wohnungsnummer.
 *
 * Getrennt von der API/DB-Logik, damit testbar.
 */
import type { FlatfoxListing } from '@/lib/channels/flatfox/client';

/**
 * Aus einem Flatfox-Listing die interne Wohnungsnummer ableiten.
 * Format: <Haus>.<4-stellige-Nummer>, z.B. "C.0406".
 *
 * Liefert null, wenn ref_house oder ref_object fehlt.
 */
export function listingToApartmentNumber(l: FlatfoxListing): string | null {
  if (!l.ref_house || !l.ref_object) return null;
  return `${l.ref_house}.${l.ref_object}`;
}

/**
 * Case-insensitiver Match zwischen Flatfox-Referenz und Bestand.
 * Flatfox liefert manchmal "c.0406" statt "C.0406".
 *
 * Liefert die ID der Wohnung aus dem Bestand, oder null wenn nicht gefunden.
 */
export function matchApartmentId(
  flatfoxNumber: string,
  apartments: ReadonlyArray<{ id: string; number: string }>,
): string | null {
  const target = flatfoxNumber.toLowerCase();
  const hit = apartments.find((a) => a.number.toLowerCase() === target);
  return hit?.id ?? null;
}

/**
 * Index-Map fuer einen ganzen Batch von Flatfox-Referenzen: erspart das
 * O(n*m) Looping durch die apartments-Liste pro Referenz.
 */
export function buildApartmentIndex(
  apartments: ReadonlyArray<{ id: string; number: string }>,
): Map<string, string> {
  return new Map(apartments.map((a) => [a.number.toLowerCase(), a.id]));
}
