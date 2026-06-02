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

// ── Buchungen ──────────────────────────────────────────────────────────
export type Booking = Tables['bookings']['Row'];
export type BookingInsert = Tables['bookings']['Insert'];
export type BookingUpdate = Tables['bookings']['Update'];

export type BookingStatus = Enums['booking_status'];
export type BookingPaymentStatus = Enums['booking_payment_status'];
export type CheckInOutStatus = Enums['checkinout_status'];
export type ContractStatus = Enums['contract_status'];

// ── Mieter / Gäste ─────────────────────────────────────────────────────
export type Tenant = Tables['tenants']['Row'];
export type TenantInsert = Tables['tenants']['Insert'];

export type TenantKind = Enums['tenant_kind'];
export type TenantSource = Enums['tenant_source'];

// ── Blocks (Sperren) ───────────────────────────────────────────────────
export type Block = Tables['blocks']['Row'];

// ── Channels (Direkt/Flatfox/Booking.com/…) ────────────────────────────
export type Channel = Tables['channels']['Row'];

// ── Workflow (Phase 4) ─────────────────────────────────────────────────
export type BookingTask = Tables['booking_tasks']['Row'];
export type BookingTaskInsert = Tables['booking_tasks']['Insert'];
export type WorkflowTemplate = Tables['workflow_templates']['Row'];
export type WorkflowTemplateTask = Tables['workflow_template_tasks']['Row'];

export type BookingTaskStatus = Enums['booking_task_status'];
export type WorkflowKind = Enums['workflow_kind'];
export type WorkflowScope = Enums['workflow_scope'];
export type TaskDueAnchor = Enums['task_due_anchor'];
export type TaskAssigneeRole = Enums['task_assignee_role'];

// ── Auth / Rollen ──────────────────────────────────────────────────────
export type UserRole = Enums['user_role'];

// ── Reinigung (für Labels schon jetzt benoetigt, Phase 5 baut auf) ─────
export type CleaningStatus = Enums['cleaning_status'];
