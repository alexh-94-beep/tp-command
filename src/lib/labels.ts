/**
 * Zentrale Labels für Enums – damit Übersetzungen und Farben konsistent
 * über die ganze App sind.
 */
import type {
  ApartmentOwnership,
  ApartmentStatus,
  ApartmentType,
  CleaningStatus,
  NameTagStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  RentalType,
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
