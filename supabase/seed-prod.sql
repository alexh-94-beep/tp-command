-- ============================================================
-- Production-Seed für TP-Command
--
-- Dieser File ersetzt seed.sql in Production. Er enthält
-- KEINE Demo-Wohnungen und KEINE Demo-Buchungen, sondern nur:
--   1. Channels (Direkt, Flatfox, Booking.com, ...)
--   2. User-Profile für Alex, Brian, Sharon, Mireme
--   3. Cleaning-Staff für Nicole, Sevdale, Bide
--
-- ABLAUF:
--   1. Erst die User in Supabase Dashboard → Auth → Users anlegen
--      (Add user, Email + Passwort oder Magic Link).
--   2. Dann diesen File im SQL-Editor des Supabase-Dashboards
--      ausführen (oder via `supabase db reset --linked` mit
--      seed-prod.sql aktiv).
--
-- Das INSERT in users matcht über die E-Mail-Adresse mit
-- auth.users — wenn ein User noch nicht angelegt ist, wird die
-- Zeile einfach übersprungen.
-- ============================================================

-- 1. Channels --------------------------------------------------
insert into channels (code, display_name, is_active) values
  ('direct',     'Direkt',         true),
  ('flatfox',    'Flatfox',        true),
  ('immotop',    'Immotop',        true),
  ('booking_com','Booking.com',    true),
  ('airbnb',     'Airbnb',         false),
  ('expedia',    'Expedia',        false),
  ('website',    'Eigene Website', false)
on conflict (code) do nothing;

-- 2. User-Profile ---------------------------------------------
-- Erwartet, dass die auth.users Einträge bereits existieren.
-- Falls einer fehlt, wird die Zeile übersprungen (kein Fehler).

with team(email, full_name, role) as (
  values
    ('a.huber@threepoint.ch',   'Alex Huber',     'admin'::user_role),
    ('b.schwarz@threepoint.ch', 'Brian Schwarz',  'office'::user_role),
    ('s.schwarz@threepoint.ch', 'Sharon Schwarz', 'office'::user_role),
    ('m.haliti@threepoint.ch',  'Mireme Haliti',  'cleaning'::user_role)
)
insert into users (id, email, full_name, role)
select au.id, t.email, t.full_name, t.role
  from team t
  join auth.users au on lower(au.email) = lower(t.email)
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role;

-- 3. Operative Reinigungs-Personen
-- Nicole, Sevdale, Bide werden bereits durch die Migrationen
-- 20260501006000 und 20260501008000 angelegt. Mireme erhält über
-- Block 2 oben einen App-User mit role='cleaning'. Wenn Mireme
-- zusätzlich als Cleaning-Staff in der Liste erscheinen soll
-- (für Drag & Drop im Wochenplan), kann der folgende Insert
-- ausgeführt werden:
--
-- insert into cleaning_staff (full_name, is_active, is_lead)
-- select 'Mireme', true, true
-- where not exists (select 1 from cleaning_staff where full_name = 'Mireme');
