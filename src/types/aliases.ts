/**
 * Schmaler Re-Export-Layer für die generierten Supabase-Typen.
 *
 * `src/types/db.ts` wird per `pnpm db:types` erzeugt und exportiert nur
 * `Database`. Wir verdichten hier die in der App häufig benutzten Row-
 * und Enum-Typen, damit Imports kurz bleiben (`Apartment` statt
 * `Database['public']['Tables']['apartments']['Row']`).
 *
 * Pro neuer Domäne in einer Phase werden hier die Aliase ergänzt –
 * NICHT in `db.ts` schreiben (wird beim nächsten gen-types überschrieben).
 */
import type { Database } from '@/types/db';

type Tables = Database['public']['Tables'];
type Enums = Database['public']['Enums'];

// ── Apartments ──────────────────────────────────────────────────────────
export type Apartment = Tables['apartments']['Row'];
export type ApartmentInsert = Tables['apartments']['Insert'];
export type ApartmentUpdate = Tables['apartments']['Update'];

export type ApartmentStatus = Enums['apartment_status'];
export type ApartmentType = Enums['apartment_type'];
export type ApartmentOwnership = Enums['apartment_ownership'];
export type NameTagStatus = Enums['name_tag_status'];
export type RentalType = Enums['rental_type'];

// ── Auth / Rollen ──────────────────────────────────────────────────────
export type UserRole = Enums['user_role'];

// ── Reinigung (für Labels schon jetzt benoetigt, Phase 5 baut auf) ─────
export type CleaningStatus = Enums['cleaning_status'];
