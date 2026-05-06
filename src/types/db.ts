/**
 * Datenbank-Typen.
 *
 * In der Produktion automatisch generiert mit:
 *   pnpm db:types
 *
 * Hier liegt eine handgepflegte Minimalversion, damit das Projekt direkt nach
 * dem Klonen typisiert ist. Sobald die Migrationen lokal gelaufen sind, sollte
 * sie durch den Generator-Output ersetzt werden.
 */

export type UserRole = 'admin' | 'office' | 'cleaning' | 'management';
export type ApartmentType = 'junior' | 'senior' | 'suite' | 'studio';
export type ApartmentStatus =
  | 'available'
  | 'occupied'
  | 'terminated'
  | 'contract_pending'
  | 'booking_active'
  | 'maintenance'
  | 'blocked';
export type ApartmentOwnership = 'own' | 'sold_managed' | 'sold_external';
export type NameTagStatus = 'pending' | 'ordered' | 'installed';
export type RentalType = 'long_term' | 'short_term' | 'booking';
export type BookingStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type ContractStatus = 'draft' | 'sent' | 'signed' | 'cancelled';
export type CheckInOutStatus = 'pending' | 'completed';
export type BookingPaymentStatus = 'pending' | 'partial' | 'paid' | 'overdue';
export type CleaningType =
  | 'checkout'
  | 'pre_checkin'
  | 'intermediate'
  | 'special'
  | 'deep_clean';
export type CleaningPriority = 'low' | 'normal' | 'high' | 'urgent';
export type CleaningStatus = 'open' | 'in_progress' | 'done' | 'quality_checked';
export type CleaningFrequency = 'weekly' | 'biweekly';
export type PaymentType =
  | 'rent'
  | 'deposit'
  | 'first_rent'
  | 'booking_payout'
  | 'short_term_flat'
  | 'parking'
  | 'other';
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type PaymentMethod =
  | 'bank_transfer'
  | 'manual_slip'
  | 'booking_payout'
  | 'flatfox'
  | 'card'
  | 'other';
export type TenantKind = 'tenant' | 'guest';
export type TenantSource =
  | 'direct'
  | 'flatfox'
  | 'booking_com'
  | 'airbnb'
  | 'expedia'
  | 'website';

export type CivilStatus =
  | 'single'
  | 'married'
  | 'divorced'
  | 'widowed'
  | 'partnership'
  | 'separated'
  | 'unknown';
export type Gender = 'male' | 'female' | 'other' | 'unknown';
export type ResidencePermit =
  | 'C'
  | 'B'
  | 'L'
  | 'F'
  | 'G'
  | 'N'
  | 'S'
  | 'CH'
  | 'EU'
  | 'other'
  | 'none';
export type EmploymentStatus =
  | 'employed'
  | 'self_employed'
  | 'retired'
  | 'student'
  | 'unemployed'
  | 'other'
  | 'unknown';
export type OccupantRole =
  | 'main_tenant'
  | 'co_tenant'
  | 'partner'
  | 'child'
  | 'roommate'
  | 'other';
export type TenantDocumentType =
  | 'passport'
  | 'id_card'
  | 'residence_permit'
  | 'salary_slip'
  | 'tax_certificate'
  | 'debt_collection_certificate'
  | 'flatfox_application'
  | 'contract'
  | 'other';

export interface Apartment {
  id: string;
  number: string;
  building: string;
  type: ApartmentType;
  size_sqm: number | null;
  floor: number | null;
  orientation: string | null;
  status: ApartmentStatus;
  ownership: ApartmentOwnership;
  allowed_rental_types: RentalType[];
  standard_rent: number;
  short_term_flat_rate: number | null;
  has_parking: boolean;
  parking_fee: number | null;
  booking_priority: number;
  cleaning_buffer_hours: number;
  furnishing_completion: number;
  name_tag_status: NameTagStatus;
  external_link_3d: string | null;
  sale_price: number | null;
  current_tenant_label: string | null;
  current_move_in: string | null;
  current_move_out: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  tenant_kind: TenantKind;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  source: TenantSource;
  notes: string | null;
  // Flatfox-Erweiterung
  civil_status: CivilStatus | null;
  gender: Gender | null;
  residence_permit: ResidencePermit | null;
  heimatort: string | null;
  profession: string | null;
  employer: string | null;
  employment_status: EmploymentStatus | null;
  annual_income: number | null;
  has_debt_collection: boolean | null;
  previous_landlord: string | null;
  previous_landlord_phone: string | null;
  previous_landlord_email: string | null;
  flatfox_raw: Record<string, unknown> | null;
}

export interface BookingOccupant {
  booking_id: string;
  tenant_id: string;
  role: OccupantRole;
  is_main_tenant: boolean;
  notes: string | null;
}

export interface TenantDocument {
  id: string;
  tenant_id: string | null;
  booking_id: string | null;
  type: TenantDocumentType;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface Booking {
  id: string;
  apartment_id: string;
  tenant_id: string;
  rental_type: RentalType;
  channel_id: string | null;
  external_reference: string | null;
  start_date: string;
  end_date: string;
  rent_amount: number;
  deposit_amount: number;
  contract_status: ContractStatus;
  payment_status: BookingPaymentStatus;
  check_in_status: CheckInOutStatus;
  check_out_status: CheckInOutStatus;
  status: BookingStatus;
  notes: string | null;
}

export interface DashboardKpis {
  total_apartments: number;
  free_apartments: number;
  occupied_apartments: number;
  upcoming_checkins: number;
  upcoming_checkouts: number;
  open_cleanings: number;
  open_payments: number;
  needs_attention: number;
}
