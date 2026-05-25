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
