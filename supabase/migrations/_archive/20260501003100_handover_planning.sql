-- Geplante Wohnungsabnahme (Datum + Uhrzeit). Wird vom Office vorab erfasst,
-- damit das Reinigungsteam den Tag planen kann. Reinigungs-Auftrag wird ab
-- diesem Zeitpunkt + 1h angesetzt.
alter table bookings
  add column handover_planned_at timestamptz;
