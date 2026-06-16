/**
 * Zentrale Labels für Enums – damit Übersetzungen und Farben konsistent
 * über die ganze App sind.
 */
import type {
  ApartmentDamageSeverity,
  ApartmentDamageStatus,
  ApartmentOwnership,
  ApartmentStatus,
  ApartmentType,
  CleaningStatus,
  CommunicationStatus,
  CommunicationType,
  NameTagStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  RentalType,
  StandaloneTaskCategory,
  StandaloneTaskPriority,
  StandaloneTaskStatus,
} from '@/types/aliases';

export const apartmentStatusLabel: Record<ApartmentStatus, string> = {
  available: 'Verfügbar',
  occupied: 'Vermietet',
  terminated: 'Gekündigt',
  contract_pending: 'Vertrag in Erstellung',
  booking_active: 'Booking-Belegung',
  maintenance: 'In Wartung',
  blocked: 'Gesperrt',
};

export const apartmentStatusTone: Record<
  ApartmentStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  available: 'success',
  occupied: 'info',
  terminated: 'warning',
  contract_pending: 'warning',
  booking_active: 'info',
  maintenance: 'warning',
  blocked: 'danger',
};

export const ownershipLabel: Record<ApartmentOwnership, string> = {
  own: 'Eigenbestand',
  sold_managed: 'Verkauft (Vermietung über uns)',
  sold_external: 'Verkauft (extern)',
};

export const ownershipTone: Record<
  ApartmentOwnership,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  own: 'neutral',
  sold_managed: 'info',
  sold_external: 'warning',
};

export const apartmentTypeLabel: Record<ApartmentType, string> = {
  junior: 'Junior',
  senior: 'Senior',
  suite: 'Suite',
  studio: 'Studio',
};

export const rentalTypeLabel: Record<RentalType, string> = {
  long_term: 'Langzeit',
  short_term: 'Kurzzeit',
  booking: 'Booking',
};

export const nameTagLabel: Record<NameTagStatus, string> = {
  pending: 'Offen',
  ordered: 'Bestellt',
  installed: 'Montiert',
};

export const cleaningStatusLabel: Record<CleaningStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  done: 'Erledigt',
  quality_checked: 'Qualität geprüft',
};

// ── Zahlungen ──────────────────────────────────────────────────────────

export const paymentTypeLabel: Record<PaymentType, string> = {
  rent: 'Miete',
  deposit: 'Depot',
  first_rent: 'Erst-Miete',
  booking_payout: 'Booking-Auszahlung',
  short_term_flat: 'Pauschale Kurzzeit',
  parking: 'Parking',
  other: 'Sonstige',
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  pending: 'Offen',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
  cancelled: 'Storniert',
};

export const paymentStatusTone: Record<
  PaymentStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  pending: 'warning',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'neutral',
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  bank_transfer: 'Banküberweisung',
  manual_slip: 'Einzahlungsschein',
  booking_payout: 'Booking.com',
  flatfox: 'Flatfox',
  card: 'Karte',
  other: 'Sonstige',
};

export const bookingPaymentStatusLabel: Record<
  'pending' | 'partial' | 'paid' | 'overdue',
  string
> = {
  pending: 'Offen',
  partial: 'Teilweise',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
};

export const bookingPaymentStatusTone: Record<
  'pending' | 'partial' | 'paid' | 'overdue',
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  pending: 'warning',
  partial: 'info',
  paid: 'success',
  overdue: 'danger',
};

// ── Kommunikation ──────────────────────────────────────────────────────

export const communicationTypeLabel: Record<CommunicationType, string> = {
  welcome: 'Willkommen',
  payment_info: 'Zahlungsinfo',
  checkin_info: 'Anreise-Infos',
  wifi_info: 'WLAN-Zugang',
  payment_reminder: 'Zahlungs-Erinnerung',
  checkout_info: 'Auszugs-Infos',
  internal_cleaning_notification: 'Reinigungs-Notiz (intern)',
};

export const communicationStatusLabel: Record<CommunicationStatus, string> = {
  draft: 'Entwurf',
  scheduled: 'Geplant',
  sent: 'Gesendet',
  failed: 'Fehlgeschlagen',
  cancelled: 'Storniert',
};

export const communicationStatusTone: Record<
  CommunicationStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  draft: 'neutral',
  scheduled: 'info',
  sent: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

// ── Standalone-Aufgaben ────────────────────────────────────────────────

export const standaloneTaskCategoryLabel: Record<StandaloneTaskCategory, string> = {
  repair: 'Reparatur',
  office: 'Office-Todo',
  inspection: 'Inspektion',
  other: 'Sonstige',
};

export const standaloneTaskStatusLabel: Record<StandaloneTaskStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  done: 'Erledigt',
  cancelled: 'Storniert',
};

export const standaloneTaskStatusTone: Record<
  StandaloneTaskStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  cancelled: 'neutral',
};

export const standaloneTaskPriorityLabel: Record<StandaloneTaskPriority, string> = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
  urgent: 'Dringend',
};

export const standaloneTaskPriorityTone: Record<
  StandaloneTaskPriority,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  urgent: 'danger',
};

// ── Schaeden ───────────────────────────────────────────────────────────

export const apartmentDamageSeverityLabel: Record<ApartmentDamageSeverity, string> = {
  minor: 'Klein',
  normal: 'Normal',
  major: 'Gross',
  urgent: 'Dringend',
};

export const apartmentDamageSeverityTone: Record<
  ApartmentDamageSeverity,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  minor: 'neutral',
  normal: 'info',
  major: 'warning',
  urgent: 'danger',
};

export const apartmentDamageStatusLabel: Record<ApartmentDamageStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  resolved: 'Erledigt',
  wont_fix: 'Nicht behoben',
};

export const apartmentDamageStatusTone: Record<
  ApartmentDamageStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  wont_fix: 'neutral',
};
