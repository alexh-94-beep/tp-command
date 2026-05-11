-- ============================================================
-- Sub-Vermietung (Cityus & ähnliche Mieter, die weiter-vermieten):
--   - subleasing_stays: ein Aufenthalt eines Endgastes
--   - cleaning_tasks erweitert um inspection-Felder + FK zu Stay
--   - cleaning_type erweitert um 'inspection' und 'weekly_clean'
--   - apartments: Default-Schlüsselbox-Felder
-- ============================================================

-- Neue Reinigungstypen ergänzen
alter type cleaning_type add value if not exists 'inspection';
alter type cleaning_type add value if not exists 'weekly_clean';

-- Apartments: Schlüsselbox-Defaults
alter table apartments
  add column keybox_default_code     text,
  add column keybox_default_location text;

-- Sub-Aufenthalt
create type sub_source as enum ('cityus', 'other');
create type sub_status as enum ('planned', 'in_stay', 'completed', 'cancelled');

create table subleasing_stays (
  id                  uuid primary key default gen_random_uuid(),
  parent_booking_id   uuid references bookings(id) on delete set null,
  apartment_id        uuid not null references apartments(id) on delete cascade,
  guest_name          text not null,
  guest_count         int,
  check_in_date       date not null,
  check_in_time       time,
  check_out_date      date not null,
  check_out_time      time,
  keybox_code         text,            -- überschreibt apartments.keybox_default_code
  source              sub_source not null default 'cityus',
  external_reference  text,            -- z.B. Cityus-Wochenplan-Zeile
  status              sub_status not null default 'planned',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint subleasing_stays_dates_chk check (check_out_date > check_in_date)
);
create index subleasing_stays_apartment_idx on subleasing_stays(apartment_id, check_in_date);
create index subleasing_stays_status_idx on subleasing_stays(status);
create unique index subleasing_stays_unique on subleasing_stays(apartment_id, check_in_date, guest_name);

create trigger subleasing_stays_set_updated_at before update on subleasing_stays
  for each row execute function set_updated_at();

-- cleaning_tasks: Verknüpfung zum Stay + Inspektions-Felder
alter table cleaning_tasks
  add column subleasing_stay_id  uuid references subleasing_stays(id) on delete cascade,
  add column damage_found        boolean,
  add column damage_description  text,
  add column inspection_summary  text;
create index cleaning_tasks_stay_idx on cleaning_tasks(subleasing_stay_id);

-- RLS
alter table subleasing_stays enable row level security;
create policy "subleasing_stays read auth"
  on subleasing_stays for select using (auth.uid() is not null);
create policy "subleasing_stays write office"
  on subleasing_stays for insert with check (can_write());
create policy "subleasing_stays update office"
  on subleasing_stays for update using (can_write()) with check (can_write());
create policy "subleasing_stays delete admin"
  on subleasing_stays for delete using (is_admin());
