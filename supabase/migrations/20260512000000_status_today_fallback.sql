-- ============================================================================
-- view_apartment_status_today: Fallback auf apartments.status
-- ----------------------------------------------------------------------------
-- Bisherige Logik hat ausschliesslich auf aktive Bookings/Blocks geschaut und
-- damit jede Wohnung ohne Booking-Eintrag als 'available' gewertet. In der
-- Phase 1, bevor die Bookings importiert sind, fuehrte das zum Eindruck dass
-- alle 120 eigenen Wohnungen frei sind.
--
-- Neue Logik (Reihenfolge der Praezedenz):
--   1. apartments.status = 'maintenance'      → 'maintenance'
--   2. aktiver Block heute                     → 'blocked'
--   3. aktive Booking heute                    → 'occupied'
--   4. Fallback: apartments.status (= XLSX-/UI-Wert)
--
-- Dadurch wird die Wahrheit aus Bookings weiterhin bevorzugt; ohne Bookings
-- fungiert das apartments.status-Feld als Naeherung.
-- ============================================================================

create or replace view view_apartment_status_today as
with active_today as (
  select b.apartment_id
    from bookings b
   where b.status = 'active'
     and current_date >= b.start_date
     and current_date <  b.end_date
),
blocked_today as (
  select bl.apartment_id
    from blocks bl
   where current_date >= bl.start_date
     and current_date <  bl.end_date
)
select a.id, a.number, a.building, a.type, a.ownership,
       case
         when a.status = 'maintenance'        then 'maintenance'::apartment_status
         when bt.apartment_id is not null     then 'blocked'::apartment_status
         when at.apartment_id is not null     then 'occupied'::apartment_status
         else a.status
       end as effective_status
  from apartments a
  left join active_today  at on at.apartment_id = a.id
  left join blocked_today bt on bt.apartment_id = a.id;
