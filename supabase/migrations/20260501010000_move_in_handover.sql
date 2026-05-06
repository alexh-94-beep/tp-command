-- ============================================================
-- Wohnungs-ÜBERGABE bei Einzug (move_in handover)
--
-- Bislang gibt es nur die Wohnungs-ABNAHME bei Auszug
-- (handover_planned_at / handover_completed_at / handover_by).
-- Hier ergänzen wir das analoge Pendant für den Einzug, damit
-- Übergabetermin geplant + erledigt + Übergabeprotokoll abgelegt
-- werden kann.
-- ============================================================

alter table bookings
  add column move_in_planned_at   timestamptz,
  add column move_in_completed_at timestamptz,
  add column move_in_by           uuid references users(id);

create index bookings_move_in_planned_idx on bookings(move_in_planned_at)
  where move_in_planned_at is not null;
