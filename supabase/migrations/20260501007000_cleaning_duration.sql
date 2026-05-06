-- ============================================================
-- Reinigungs-Dauer + Pensum + effektiver Aufwand
-- ============================================================

-- Neuer Typ "weekly_clean_linen" damit wir Bettwäsche-Wechsel sauber unterscheiden
alter type cleaning_type add value if not exists 'weekly_clean_linen';

-- cleaning_staff erweitern
alter table cleaning_staff
  add column pensum_percent int      not null default 100,
  add column speed_factor   numeric(3,2) not null default 1.0,
  add column is_lead        boolean not null default false,
  add column is_hourly      boolean not null default false;

-- cleaning_tasks: geplante + tatsächliche Dauer
alter table cleaning_tasks
  add column estimated_duration_minutes int,
  add column actual_duration_minutes    int;

-- Mireme als Teamlead anlegen, falls noch nicht vorhanden
insert into cleaning_staff (full_name, is_lead, speed_factor, pensum_percent)
values ('Mireme', true, 1.0, 100)
on conflict do nothing;

-- Defaults für die existierenden Personen aus dem ersten Seed
update cleaning_staff set speed_factor = 0.5
  where full_name in ('Sevdale', 'Bidet');
update cleaning_staff set is_hourly = true
  where full_name = 'Bidet';
update cleaning_staff set pensum_percent = 60
  where full_name = 'Sevdale';
update cleaning_staff set pensum_percent = 100, speed_factor = 1.0
  where full_name = 'Nicole';
