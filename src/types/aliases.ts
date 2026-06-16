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

// ── Pool-Reservationen (Booking.com etc., Phase 6) ────────────────────
export type PendingReservation = Tables['pending_reservations']['Row'];
export type PendingReservationInsert = Tables['pending_reservations']['Insert'];
export type PendingReservationStatus = Enums['pending_reservation_status'];

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

// ── Reinigung (Phase 5) ────────────────────────────────────────────────
export type CleaningTask = Tables['cleaning_tasks']['Row'];
export type CleaningStaff = Tables['cleaning_staff']['Row'];
export type CleaningPhoto = Tables['cleaning_photos']['Row'];

export type CleaningStatus = Enums['cleaning_status'];
export type CleaningType = Enums['cleaning_type'];
export type CleaningPriority = Enums['cleaning_priority'];
export type AccessMethod = Enums['access_method'];

// 13.2: source ist text mit CHECK-Constraint (siehe Migration)
export type CleaningSourceTag =
  | 'manual'
  | 'auto_checkout'
  | 'cityus'
  | 'workflow'
  | 'external_owner';

// 13.5: Externe Eigentuemer (Eigentuemer hat 1..n Wohnungen)
export type ExternalOwner = Tables['external_owners']['Row'];
export type ExternalOwnerInsert = Tables['external_owners']['Insert'];
export type ExternalApartment = Tables['external_apartments']['Row'];
export type ExternalApartmentInsert = Tables['external_apartments']['Insert'];

// 13.6: Schaeden pro Wohnung (eigene Historie, mehrere parallel)
export type ApartmentDamage = Tables['apartment_damages']['Row'];
export type ApartmentDamageInsert = Tables['apartment_damages']['Insert'];
export type ApartmentDamageSeverity = Enums['apartment_damage_severity'];
export type ApartmentDamageStatus = Enums['apartment_damage_status'];

// ── Zahlungen (Phase 8) ────────────────────────────────────────────────
// BookingPaymentStatus ist oben bei Bookings bereits exportiert.
export type Payment = Tables['payments']['Row'];
export type PaymentInsert = Tables['payments']['Insert'];
export type PaymentType = Enums['payment_type'];
export type PaymentStatus = Enums['payment_status'];
export type PaymentMethod = Enums['payment_method'];

// ── Kommunikation (Phase 9) ────────────────────────────────────────────
export type Communication = Tables['communications']['Row'];
export type CommunicationInsert = Tables['communications']['Insert'];
export type CommunicationType = Enums['communication_type'];
export type CommunicationChannel = Enums['communication_channel'];
export type CommunicationStatus = Enums['communication_status'];

// ── Standalone-Aufgaben (Phase 10) ─────────────────────────────────────
export type StandaloneTask = Tables['standalone_tasks']['Row'];
export type StandaloneTaskInsert = Tables['standalone_tasks']['Insert'];
export type StandaloneTaskCategory = Enums['standalone_task_category'];
export type StandaloneTaskStatus = Enums['standalone_task_status'];
export type StandaloneTaskPriority = Enums['standalone_task_priority'];
