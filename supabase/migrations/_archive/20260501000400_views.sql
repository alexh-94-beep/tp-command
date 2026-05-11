-- ============================================================
-- Sichten für Dashboard und Kalender. Die UI liest NUR aus diesen Views.
-- ============================================================

-- Aktueller Status pro Wohnung (heute).
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
select a.id,
       a.number,
       a.building,
       a.type,
       a.ownership,
       case
         when a.status = 'maintenance' then 'maintenance'::apartment_status
         when bt.apartment_id is not null then 'blocked'::apartment_status
         when at.apartment_id is not null then 'occupied'::apartment_status
         else 'available'::apartment_status
       end as effective_status
  from apartments a
  left join active_today  at on at.apartment_id = a.id
  left join blocked_today bt on bt.apartment_id = a.id;

-- Dashboard-KPIs. Bezugsgrösse = nur aktiv vermietete Bestand
-- (own + sold_managed). sold_external bleibt als Gedankenstütze in der Liste,
-- zählt aber nicht in den KPIs.
create or replace view view_dashboard_kpis as
select
  (select count(*) from apartments
     where ownership in ('own','sold_managed'))                              as total_apartments,
  (select count(*) from view_apartment_status_today
     where ownership in ('own','sold_managed')
       and effective_status = 'available')                                   as free_apartments,
  (select count(*) from view_apartment_status_today
     where ownership in ('own','sold_managed')
       and effective_status = 'occupied')                                    as occupied_apartments,
  (select count(*) from bookings
     where status = 'planned'
       and start_date between current_date and current_date + interval '7 days') as upcoming_checkins,
  (select count(*) from bookings
     where status in ('active','planned')
       and end_date between current_date and current_date + interval '7 days')   as upcoming_checkouts,
  (select count(*) from cleaning_tasks
     where status in ('open','in_progress'))                                 as open_cleanings,
  (select count(*) from payments
     where status in ('pending','overdue')
       and due_date <= current_date + interval '14 days')                    as open_payments,
  (select count(*) from bookings
     where payment_status = 'overdue'
        or (status = 'planned' and start_date <= current_date + interval '7 days'
            and contract_status <> 'signed'))                                as needs_attention;

-- Flache Sicht für die Kalender-UI.
create or replace view view_occupancy_calendar as
select
  b.id           as event_id,
  'booking'      as event_kind,
  b.apartment_id,
  a.number       as apartment_number,
  b.start_date,
  b.end_date,
  b.rental_type::text as label,
  b.status::text as status,
  t.first_name || ' ' || t.last_name as title
from bookings b
join apartments a on a.id = b.apartment_id
join tenants    t on t.id = b.tenant_id
where b.status in ('planned','active')
union all
select
  bl.id          as event_id,
  'block'        as event_kind,
  bl.apartment_id,
  a.number       as apartment_number,
  bl.start_date,
  bl.end_date,
  'block'        as label,
  'blocked'      as status,
  bl.reason      as title
from blocks bl
join apartments a on a.id = bl.apartment_id;
