-- ============================================================
-- Kerntabellen
-- ============================================================

-- Trigger-Funktion: setzt updated_at = now() bei UPDATE.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- users (spiegelt auth.users)
-- ------------------------------------------------------------
create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  role        user_role not null default 'office',
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger users_set_updated_at before update on users
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- channels
-- ------------------------------------------------------------
create table channels (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  display_name text not null,
  is_active    boolean not null default true,
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger channels_set_updated_at before update on channels
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- apartments
-- ------------------------------------------------------------
create table apartments (
  id                    uuid primary key default gen_random_uuid(),
  number                text not null unique,                -- z.B. C.0201
  building              text not null,                       -- C, D, E
  type                  apartment_type not null,
  size_sqm              numeric(6,2),
  floor                 int,
  orientation           text,                                -- z.B. "Nord/Ost"
  status                apartment_status not null default 'available',
  ownership             apartment_ownership not null default 'own',
  allowed_rental_types  rental_type[] not null default '{long_term}',
  standard_rent         numeric(12,2) not null default 0,
  short_term_flat_rate  numeric(12,2),
  has_parking           boolean not null default false,
  parking_fee           numeric(12,2),
  booking_priority      int not null default 0,
  cleaning_buffer_hours int not null default 6,
  furnishing_completion numeric(4,3) not null default 1.000  -- 0.000 – 1.000
                        check (furnishing_completion >= 0 and furnishing_completion <= 1),
  name_tag_status       name_tag_status not null default 'pending',
  external_link_3d      text,                                -- Beyonity 3D-Link
  sale_price            numeric(12,2),                       -- für verkaufte / im Verkauf
  -- Anzeige-Felder als Spiegel der Excel-Spalte „Mieter / Einzug / Auszug".
  -- Werden durch echte Buchungen ersetzt, sobald Phase 1.2 (Buchungen-Import) läuft.
  current_tenant_label  text,
  current_move_in       date,
  current_move_out      date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index apartments_status_idx on apartments(status);
create index apartments_building_idx on apartments(building);
create index apartments_ownership_idx on apartments(ownership);
create index apartments_allowed_rental_types_idx
  on apartments using gin (allowed_rental_types);
create trigger apartments_set_updated_at before update on apartments
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- apartment_channel_links
-- ------------------------------------------------------------
create table apartment_channel_links (
  apartment_id   uuid not null references apartments(id) on delete cascade,
  channel_id     uuid not null references channels(id) on delete cascade,
  external_id    text,
  ical_pull_url  text,
  ical_push_url  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (apartment_id, channel_id)
);
create trigger apartment_channel_links_set_updated_at before update on apartment_channel_links
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- tenants
-- ------------------------------------------------------------
create table tenants (
  id                  uuid primary key default gen_random_uuid(),
  tenant_kind         tenant_kind not null,
  first_name          text not null,
  last_name           text not null,
  email               text,
  phone               text,
  address             text,
  nationality         text,
  date_of_birth       date,
  id_document_type    id_doc_type,
  id_document_number  text,
  source              tenant_source not null default 'direct',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index tenants_email_idx on tenants(email);
create index tenants_kind_idx on tenants(tenant_kind);
create trigger tenants_set_updated_at before update on tenants
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- bookings
-- ------------------------------------------------------------
create table bookings (
  id                    uuid primary key default gen_random_uuid(),
  apartment_id          uuid not null references apartments(id) on delete restrict,
  tenant_id             uuid not null references tenants(id) on delete restrict,
  rental_type           rental_type not null,
  channel_id            uuid references channels(id),
  external_reference    text,
  start_date            date not null,
  end_date              date not null,
  check_in_time         time,
  check_out_time        time,
  rent_amount           numeric(12,2) not null default 0,
  deposit_amount        numeric(12,2) not null default 0,
  short_term_flat_rate  numeric(12,2),
  parking_included      boolean not null default false,
  parking_fee           numeric(12,2),
  contract_status       contract_status not null default 'draft',
  payment_status        booking_payment_status not null default 'pending',
  check_in_status       checkinout_status not null default 'pending',
  check_out_status      checkinout_status not null default 'pending',
  status                booking_status not null default 'planned',
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint bookings_dates_chk check (end_date > start_date)
);
create index bookings_apartment_idx on bookings(apartment_id, start_date, end_date);
create index bookings_tenant_idx on bookings(tenant_id);
create index bookings_status_idx on bookings(status);
create index bookings_channel_idx on bookings(channel_id);

-- Doppelbelegungs-Schutz auf Datenbank-Ebene.
-- Greift NUR für Buchungen, die als geplant oder aktiv markiert sind.
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    apartment_id with =,
    daterange(start_date, end_date, '[)') with &&
  ) where (status in ('planned','active'));

create trigger bookings_set_updated_at before update on bookings
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- blocks (Wartung, Eigennutzung etc.)
-- ------------------------------------------------------------
create table blocks (
  id           uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  reason       text not null,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint blocks_dates_chk check (end_date > start_date)
);
create index blocks_apartment_idx on blocks(apartment_id, start_date, end_date);
alter table blocks
  add constraint blocks_no_overlap
  exclude using gist (
    apartment_id with =,
    daterange(start_date, end_date, '[)') with &&
  );
create trigger blocks_set_updated_at before update on blocks
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- payments
-- ------------------------------------------------------------
create table payments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  type        payment_type not null,
  amount      numeric(12,2) not null,
  due_date    date not null,
  paid_date   date,
  status      payment_status not null default 'pending',
  method      payment_method not null default 'bank_transfer',
  reference   text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index payments_booking_idx on payments(booking_id);
create index payments_status_idx on payments(status);
create index payments_due_date_idx on payments(due_date);
create trigger payments_set_updated_at before update on payments
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- cleaning_tasks
-- ------------------------------------------------------------
create table cleaning_tasks (
  id                  uuid primary key default gen_random_uuid(),
  apartment_id        uuid not null references apartments(id) on delete cascade,
  booking_id          uuid references bookings(id) on delete set null,
  scheduled_date      date not null,
  scheduled_window    tstzrange,
  type                cleaning_type not null,
  priority            cleaning_priority not null default 'normal',
  status              cleaning_status not null default 'open',
  assigned_to         uuid references users(id),
  notes               text,
  completed_at        timestamptz,
  quality_checked_at  timestamptz,
  quality_checked_by  uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index cleaning_tasks_apartment_idx on cleaning_tasks(apartment_id, scheduled_date);
create index cleaning_tasks_status_idx on cleaning_tasks(status);
create index cleaning_tasks_assigned_idx on cleaning_tasks(assigned_to);
create trigger cleaning_tasks_set_updated_at before update on cleaning_tasks
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- cleaning_photos
-- ------------------------------------------------------------
create table cleaning_photos (
  id                uuid primary key default gen_random_uuid(),
  cleaning_task_id  uuid not null references cleaning_tasks(id) on delete cascade,
  storage_path      text not null,
  uploaded_by       uuid references users(id),
  taken_at          timestamptz,
  created_at        timestamptz not null default now()
);
create index cleaning_photos_task_idx on cleaning_photos(cleaning_task_id);

-- ------------------------------------------------------------
-- communications
-- ------------------------------------------------------------
create table communications (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references bookings(id) on delete set null,
  apartment_id  uuid references apartments(id) on delete set null,
  type          communication_type not null,
  channel       communication_channel not null default 'email',
  recipient     text not null,
  subject       text,
  body          text,
  status        communication_status not null default 'draft',
  template_key  text,
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index communications_booking_idx on communications(booking_id);
create index communications_status_idx on communications(status);
create trigger communications_set_updated_at before update on communications
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- audit_log
-- ------------------------------------------------------------
create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references users(id),
  entity_type  text not null,
  entity_id    uuid,
  action       text not null,
  diff         jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log(entity_type, entity_id);
create index audit_log_actor_idx on audit_log(actor_id);

-- ------------------------------------------------------------
-- maintenance_visits  (= Sheet "Termine für Wartung")
-- ------------------------------------------------------------
create table maintenance_visits (
  id              uuid primary key default gen_random_uuid(),
  apartment_id    uuid not null references apartments(id) on delete cascade,
  scheduled_date  date not null,
  scheduled_time  time,
  topic           text,
  contact_method  maintenance_contact_method not null default 'none',
  status          maintenance_visit_status not null default 'planned',
  responsible     text,                          -- z.B. "Brian"
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index maintenance_visits_apartment_date_idx
  on maintenance_visits(apartment_id, scheduled_date);
create index maintenance_visits_status_idx on maintenance_visits(status);
create trigger maintenance_visits_set_updated_at before update on maintenance_visits
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- defects  (= Sheets "Mängel" / "Mängel RG MEG")
-- ------------------------------------------------------------
create table defects (
  id              uuid primary key default gen_random_uuid(),
  apartment_id    uuid not null references apartments(id) on delete cascade,
  reported_at     date not null default current_date,
  category        text,                          -- "Möblierung", "Elektro", ...
  title           text not null,
  description     text,
  severity        defect_severity not null default 'normal',
  status          defect_status not null default 'open',
  reported_by     uuid references users(id),
  assigned_to     uuid references users(id),
  resolved_at     timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index defects_apartment_idx on defects(apartment_id);
create index defects_status_idx on defects(status);
create trigger defects_set_updated_at before update on defects
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- waitlist  (= Sheet "Warteliste")
-- ------------------------------------------------------------
create table waitlist (
  id                  uuid primary key default gen_random_uuid(),
  first_name          text not null,
  last_name           text not null,
  email               text,
  phone               text,
  desired_type        apartment_type,
  desired_move_in     date,
  budget_max          numeric(12,2),
  status              waitlist_status not null default 'open',
  assigned_apartment  uuid references apartments(id),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index waitlist_status_idx on waitlist(status);
create trigger waitlist_set_updated_at before update on waitlist
  for each row execute function set_updated_at();
