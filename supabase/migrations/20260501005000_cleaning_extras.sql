-- Externe Wohnungen: Kontakt-Felder strukturiert
alter table external_apartments
  add column contact_name  text,
  add column contact_phone text,
  add column contact_email text;

-- Reinigungs-Auftrag: Uhrzeit + Zutritts-Methode
create type access_method as enum (
  'key_available',     -- Schlüssel ist bei uns
  'customer_at_home',  -- Kunde ist zuhause
  'key_at_reception',  -- Schlüssel beim Empfang
  'key_box',           -- Schlüsselbox (Code)
  'other'
);

alter table cleaning_tasks
  add column scheduled_time time,
  add column access_method  access_method,
  add column access_notes   text;
