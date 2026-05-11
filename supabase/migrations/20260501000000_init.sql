-- ============================================================================
-- TP-Command — Konsolidiertes Initial-Schema
--
-- Eine einzige Migration, die das gesamte Datenmodell aufbaut.
-- Aufbau (in dieser Reihenfolge):
--
--   1. Extensions
--   2. Helper-Funktionen (Trigger-Helper)
--   3. Enums
--   4. Tables  (alle Spalten direkt mit drin – keine späteren ALTERs)
--   5. Indexes & Exclude-Constraints
--   6. Auth-Rollen-Helper (lesen aus public.users)
--   7. RLS aktivieren + Policies
--   8. Triggers (updated_at + payment-recompute)
--   9. Funktionen (mark_overdue_payments)
--  10. Views (Dashboard, Kalender, Status)
--  11. Storage-Buckets + Storage-Policies
--  12. Workflow-Templates seeden (struktureller Stamm)
--
-- Operative Stamm-Daten (User-Profile, Channels, Cleaning-Staff)
-- liegen in supabase/seed-prod.sql, NICHT hier.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "btree_gist"; -- daterange + EXCLUDE USING gist


-- ============================================================================
-- 2. HELPER-FUNKTIONEN (für Trigger)
-- ============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ============================================================================
-- 3. ENUMS
-- ============================================================================

-- User & Apartment
create type user_role           as enum ('admin','office','cleaning','management');
create type apartment_type      as enum ('junior','senior','suite','studio');
create type apartment_status    as enum (
  'available','occupied','terminated','contract_pending',
  'booking_active','maintenance','blocked'
);
create type apartment_ownership as enum ('own','sold_managed','sold_external');
create type name_tag_status     as enum ('pending','ordered','installed');

-- Wartung & Mängel
create type maintenance_visit_status   as enum ('planned','confirmed','done','cancelled');
create type maintenance_contact_method as enum ('email','whatsapp','phone','none');
create type defect_severity            as enum ('low','normal','high','urgent');
create type defect_status              as enum ('open','in_progress','resolved','wont_fix');
create type waitlist_status            as enum ('open','contacted','placed','dropped');

-- Buchung & Zahlung
create type rental_type              as enum ('long_term','short_term','booking');
create type booking_status           as enum ('planned','active','completed','cancelled');
create type contract_status          as enum ('draft','sent','signed','cancelled');
create type checkinout_status        as enum ('pending','completed');
create type booking_payment_status   as enum ('pending','partial','paid','overdue');
create type payment_type             as enum (
  'rent','deposit','first_rent','booking_payout',
  'short_term_flat','parking','other'
);
create type payment_status           as enum ('pending','paid','overdue','cancelled');
create type payment_method           as enum (
  'bank_transfer','manual_slip','booking_payout','flatfox','card','other'
);

-- Reinigung
create type cleaning_type     as enum (
  'checkout','pre_checkin','intermediate','special','deep_clean',
  'inspection','weekly_clean','weekly_clean_linen'
);
create type cleaning_priority as enum ('low','normal','high','urgent');
create type cleaning_status   as enum ('open','in_progress','done','quality_checked');
create type cleaning_frequency as enum ('weekly','biweekly');
create type access_method     as enum (
  'key_available','customer_at_home','key_at_reception','key_box','other'
);

-- Kommunikation
create type communication_type    as enum (
  'welcome','payment_info','checkin_info','wifi_info',
  'payment_reminder','checkout_info','internal_cleaning_notification'
);
create type communication_channel as enum ('email','sms','internal');
create type communication_status  as enum ('draft','scheduled','sent','failed','cancelled');

-- Mieter / Gast
create type tenant_kind   as enum ('tenant','guest');
create type tenant_source as enum (
  'direct','flatfox','booking_com','airbnb','expedia','website'
);
create type id_doc_type   as enum ('passport','id_card','driver_license');

-- Flatfox-Personalien
create type civil_status      as enum (
  'single','married','divorced','widowed','partnership','separated','unknown'
);
create type gender            as enum ('male','female','other','unknown');
create type residence_permit  as enum ('C','B','L','F','G','N','S','CH','EU','other','none');
create type employment_status as enum (
  'employed','self_employed','retired','student','unemployed','other','unknown'
);
create type occupant_role     as enum (
  'main_tenant','co_tenant','partner','child','roommate','other'
);
create type tenant_document_type as enum (
  'passport','id_card','residence_permit','salary_slip','tax_certificate',
  'debt_collection_certificate','flatfox_application','contract','other'
);

-- Pool-Reservationen (Booking.com etc.)
create type pending_reservation_status as enum ('pending','assigned','cancelled');

-- Sub-Vermietung (Cityus etc.)
create type sub_source as enum ('cityus','other');
create type sub_status as enum ('planned','in_stay','completed','cancelled');

-- Workflow / Aufgaben
create type workflow_kind       as enum ('move_in','move_out');
create type workflow_scope      as enum ('long_term','short_term','booking','all');
create type booking_task_status as enum ('open','in_progress','done','skipped','na');
create type task_due_anchor     as enum ('created','check_in','check_out');
create type task_assignee_role  as enum ('office','admin','cleaning','any');


-- ============================================================================
-- 4. TABLES
-- Reihenfolge wegen FK-Abhängigkeiten:
--   users → channels → apartments → tenants → bookings → ...
-- Alle Spalten direkt – keine späteren ALTER TABLEs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- users  (spiegelt auth.users)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- channels  (Direkt, Flatfox, Booking.com, Airbnb, Expedia, Website)
-- ----------------------------------------------------------------------------
create table channels (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  display_name text not null,
  is_active    boolean not null default true,
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- apartments  (180 Wohnungen in 3 Häusern + sold_external als Gedankenstütze)
-- ----------------------------------------------------------------------------
create table apartments (
  id                       uuid primary key default gen_random_uuid(),
  number                   text not null unique,
  building                 text not null,
  type                     apartment_type not null,
  size_sqm                 numeric(6,2),
  floor                    int,
  orientation              text,
  status                   apartment_status not null default 'available',
  ownership                apartment_ownership not null default 'own',
  allowed_rental_types     rental_type[] not null default '{long_term}',
  standard_rent            numeric(12,2) not null default 0,
  short_term_flat_rate     numeric(12,2),
  has_parking              boolean not null default false,
  parking_fee              numeric(12,2),
  booking_priority         int not null default 0,
  cleaning_buffer_hours    int not null default 6,
  furnishing_completion    numeric(4,3) not null default 1.000
                           check (furnishing_completion between 0 and 1),
  name_tag_status          name_tag_status not null default 'pending',
  external_link_3d         text,
  sale_price               numeric(12,2),
  current_tenant_label     text,
  current_move_in          date,
  current_move_out         date,
  keybox_default_code      text,
  keybox_default_location  text,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- apartment_channel_links  (welche Wohnung ist auf welchem Channel gelistet)
-- ----------------------------------------------------------------------------
create table apartment_channel_links (
  apartment_id   uuid not null references apartments(id) on delete cascade,
  channel_id     uuid not null references channels(id)   on delete cascade,
  external_id    text,
  ical_pull_url  text,
  ical_push_url  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (apartment_id, channel_id)
);

-- ----------------------------------------------------------------------------
-- tenants  (inkl. Flatfox-Felder)
-- ----------------------------------------------------------------------------
create table tenants (
  id                       uuid primary key default gen_random_uuid(),
  tenant_kind              tenant_kind not null,
  first_name               text not null,
  last_name                text not null,
  email                    text,
  phone                    text,
  address                  text,
  nationality              text,
  date_of_birth            date,
  id_document_type         id_doc_type,
  id_document_number       text,
  source                   tenant_source not null default 'direct',
  -- Flatfox-Personalien
  civil_status             civil_status,
  gender                   gender,
  residence_permit         residence_permit,
  heimatort                text,
  profession               text,
  employer                 text,
  employment_status        employment_status,
  annual_income            numeric(12,2),
  has_debt_collection      boolean,
  previous_landlord        text,
  previous_landlord_phone  text,
  previous_landlord_email  text,
  flatfox_raw              jsonb,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- bookings  (inkl. Übergabe-Einzug + Abnahme-Auszug)
-- ----------------------------------------------------------------------------
create table bookings (
  id                       uuid primary key default gen_random_uuid(),
  apartment_id             uuid not null references apartments(id) on delete restrict,
  tenant_id                uuid not null references tenants(id)    on delete restrict,
  rental_type              rental_type not null,
  channel_id               uuid references channels(id),
  external_reference       text,
  start_date               date not null,
  end_date                 date not null,
  check_in_time            time,
  check_out_time           time,
  rent_amount              numeric(12,2) not null default 0,
  deposit_amount           numeric(12,2) not null default 0,
  short_term_flat_rate     numeric(12,2),
  parking_included         boolean not null default false,
  parking_fee              numeric(12,2),
  contract_status          contract_status not null default 'draft',
  payment_status           booking_payment_status not null default 'pending',
  check_in_status          checkinout_status not null default 'pending',
  check_out_status         checkinout_status not null default 'pending',
  status                   booking_status not null default 'planned',
  -- Wohnungs-Übergabe (Einzug)
  move_in_planned_at       timestamptz,
  move_in_completed_at     timestamptz,
  move_in_by               uuid references users(id),
  -- Wohnungs-Abnahme (Auszug)
  handover_planned_at      timestamptz,
  handover_completed_at    timestamptz,
  handover_by              uuid references users(id),
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint bookings_dates_chk check (end_date > start_date)
);

-- ----------------------------------------------------------------------------
-- booking_occupants  (mehrere Bewohner pro Buchung – Familie / WG)
-- ----------------------------------------------------------------------------
create table booking_occupants (
  booking_id     uuid not null references bookings(id) on delete cascade,
  tenant_id      uuid not null references tenants(id)  on delete restrict,
  role           occupant_role not null default 'co_tenant',
  is_main_tenant boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now(),
  primary key (booking_id, tenant_id)
);

-- ----------------------------------------------------------------------------
-- tenant_documents  (Pass, Lohnausweis, Vertrag, Übergabeprotokoll, ...)
-- ----------------------------------------------------------------------------
create table tenant_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade,
  booking_id    uuid references bookings(id) on delete set null,
  type          tenant_document_type not null default 'other',
  filename      text not null,
  storage_path  text not null,
  mime_type     text,
  size_bytes    int,
  uploaded_by   uuid references users(id),
  uploaded_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- blocks  (Wartung, Eigennutzung, manuelle Sperren)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- payments
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- pending_reservations  (Booking.com Pool-Modus)
-- ----------------------------------------------------------------------------
create table pending_reservations (
  id                   uuid primary key default gen_random_uuid(),
  channel_id           uuid not null references channels(id) on delete cascade,
  external_uid         text not null,
  start_date           date not null,
  end_date             date not null,
  summary              text,
  description          text,
  guest_count          int,
  status               pending_reservation_status not null default 'pending',
  assigned_booking_id  uuid references bookings(id) on delete set null,
  assigned_by          uuid references users(id),
  assigned_at          timestamptz,
  raw_payload          jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (channel_id, external_uid),
  constraint pending_reservations_dates_chk check (end_date > start_date)
);

-- ----------------------------------------------------------------------------
-- external_apartments  (Eigentumswohnungen ausserhalb Bestand, nur Reinigung)
-- ----------------------------------------------------------------------------
create table external_apartments (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,
  address        text,
  contact        text,
  contact_name   text,
  contact_phone  text,
  contact_email  text,
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- subleasing_stays  (Cityus-Aufenthalte)
-- ----------------------------------------------------------------------------
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
  keybox_code         text,
  source              sub_source not null default 'cityus',
  external_reference  text,
  status              sub_status not null default 'planned',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint subleasing_stays_dates_chk check (check_out_date > check_in_date)
);

-- ----------------------------------------------------------------------------
-- cleaning_staff  (operative Personen ohne App-Zugang)
-- ----------------------------------------------------------------------------
create table cleaning_staff (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  email           text,
  phone           text,
  pensum_percent  int not null default 100,
  speed_factor    numeric(3,2) not null default 1.0,
  is_lead         boolean not null default false,
  is_hourly       boolean not null default false,
  team_name       text,                          -- z.B. "Sevdale & Bide"
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- cleaning_schedules  (wiederkehrende Reinigung, wöchentlich/zweiwöchentlich)
-- ----------------------------------------------------------------------------
create table cleaning_schedules (
  id                       uuid primary key default gen_random_uuid(),
  apartment_id             uuid references apartments(id) on delete cascade,
  external_apartment_id    uuid references external_apartments(id) on delete cascade,
  frequency                cleaning_frequency not null,
  weekday                  int not null check (weekday between 0 and 6),
  start_date               date not null default current_date,
  end_date                 date,
  default_assignee         uuid references users(id),
  notes                    text,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint cleaning_schedules_target_chk
    check ((apartment_id is not null) <> (external_apartment_id is not null))
);

-- ----------------------------------------------------------------------------
-- cleaning_tasks  (zentrale Auftrags-Tabelle)
-- ----------------------------------------------------------------------------
create table cleaning_tasks (
  id                          uuid primary key default gen_random_uuid(),
  apartment_id                uuid references apartments(id) on delete cascade,
  external_apartment_id       uuid references external_apartments(id) on delete set null,
  booking_id                  uuid references bookings(id) on delete set null,
  schedule_id                 uuid references cleaning_schedules(id) on delete set null,
  subleasing_stay_id          uuid references subleasing_stays(id) on delete cascade,
  scheduled_date              date not null,
  scheduled_time              time,
  scheduled_window            tstzrange,
  type                        cleaning_type not null,
  priority                    cleaning_priority not null default 'normal',
  status                      cleaning_status not null default 'open',
  assigned_to                 uuid references users(id),
  staff_id                    uuid references cleaning_staff(id) on delete set null,
  access_method               access_method,
  access_notes                text,
  estimated_duration_minutes  int,
  actual_duration_minutes     int,
  damage_found                boolean,
  damage_description          text,
  inspection_summary          text,
  notes                       text,
  completed_at                timestamptz,
  quality_checked_at          timestamptz,
  quality_checked_by          uuid references users(id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint cleaning_tasks_target_chk
    check ((apartment_id is not null) <> (external_apartment_id is not null))
);

-- ----------------------------------------------------------------------------
-- cleaning_photos
-- ----------------------------------------------------------------------------
create table cleaning_photos (
  id                uuid primary key default gen_random_uuid(),
  cleaning_task_id  uuid not null references cleaning_tasks(id) on delete cascade,
  storage_path      text not null,
  uploaded_by       uuid references users(id),
  taken_at          timestamptz,
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- communications  (versendete Mails / SMS – Audit-Trail)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- audit_log
-- ----------------------------------------------------------------------------
create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references users(id),
  entity_type  text not null,
  entity_id    uuid,
  action       text not null,
  diff         jsonb,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- maintenance_visits
-- ----------------------------------------------------------------------------
create table maintenance_visits (
  id              uuid primary key default gen_random_uuid(),
  apartment_id    uuid not null references apartments(id) on delete cascade,
  scheduled_date  date not null,
  scheduled_time  time,
  topic           text,
  contact_method  maintenance_contact_method not null default 'none',
  status          maintenance_visit_status not null default 'planned',
  responsible     text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- defects  (Mängel)
-- ----------------------------------------------------------------------------
create table defects (
  id            uuid primary key default gen_random_uuid(),
  apartment_id  uuid not null references apartments(id) on delete cascade,
  reported_at   date not null default current_date,
  category      text,
  title         text not null,
  description   text,
  severity      defect_severity not null default 'normal',
  status        defect_status not null default 'open',
  reported_by   uuid references users(id),
  assigned_to   uuid references users(id),
  resolved_at   timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- waitlist
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- workflow_templates  (Vorlagen pro Mietart x Einzug/Auszug)
-- ----------------------------------------------------------------------------
create table workflow_templates (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  name         text not null,
  kind         workflow_kind not null,
  scope        workflow_scope not null,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- workflow_template_tasks  (einzelne Schritte einer Vorlage)
-- ----------------------------------------------------------------------------
create table workflow_template_tasks (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references workflow_templates(id) on delete cascade,
  position        int not null,
  code            text not null,
  title           text not null,
  description     text,
  category        text,
  due_offset_days int not null default 0,
  due_anchor      task_due_anchor not null default 'check_in',
  assignee_role   task_assignee_role not null default 'office',
  is_optional     boolean not null default false,
  is_conditional  boolean not null default false,
  condition_key   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (template_id, code)
);

-- ----------------------------------------------------------------------------
-- booking_tasks  (instanziierte Aufgaben pro Buchung)
-- ----------------------------------------------------------------------------
create table booking_tasks (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references bookings(id) on delete cascade,
  template_task_id  uuid references workflow_template_tasks(id) on delete set null,
  template_id       uuid references workflow_templates(id) on delete set null,
  kind              workflow_kind not null,
  position          int not null,
  code              text,
  title             text not null,
  description       text,
  category          text,
  due_date          date,
  due_anchor        task_due_anchor,
  status            booking_task_status not null default 'open',
  is_optional       boolean not null default false,
  is_conditional    boolean not null default false,
  condition_key     text,
  assigned_to       uuid references users(id),
  completed_at      timestamptz,
  completed_by      uuid references users(id),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);


-- ============================================================================
-- 5. INDEXES & EXCLUDE-CONSTRAINTS
-- ============================================================================

-- apartments
create index apartments_status_idx     on apartments(status);
create index apartments_building_idx   on apartments(building);
create index apartments_ownership_idx  on apartments(ownership);
create index apartments_allowed_rental_types_idx
  on apartments using gin (allowed_rental_types);

-- tenants
create index tenants_email_idx on tenants(email);
create index tenants_kind_idx  on tenants(tenant_kind);

-- bookings + Doppelbelegungs-Schutz
create index bookings_apartment_idx       on bookings(apartment_id, start_date, end_date);
create index bookings_tenant_idx          on bookings(tenant_id);
create index bookings_status_idx          on bookings(status);
create index bookings_channel_idx         on bookings(channel_id);
create index bookings_move_in_planned_idx on bookings(move_in_planned_at)
  where move_in_planned_at is not null;

alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    apartment_id with =,
    daterange(start_date, end_date, '[)') with &&
  ) where (status in ('planned','active'));

-- booking_occupants: max. ein Hauptmieter pro Buchung
create index booking_occupants_tenant_idx on booking_occupants(tenant_id);
create unique index booking_occupants_one_main
  on booking_occupants(booking_id) where is_main_tenant;

-- tenant_documents
create index tenant_documents_tenant_idx  on tenant_documents(tenant_id);
create index tenant_documents_booking_idx on tenant_documents(booking_id);

-- blocks + No-Overlap
create index blocks_apartment_idx on blocks(apartment_id, start_date, end_date);
alter table blocks
  add constraint blocks_no_overlap
  exclude using gist (
    apartment_id with =,
    daterange(start_date, end_date, '[)') with &&
  );

-- payments
create index payments_booking_idx  on payments(booking_id);
create index payments_status_idx   on payments(status);
create index payments_due_date_idx on payments(due_date);

-- pending_reservations
create index pending_reservations_status_idx on pending_reservations(status);
create index pending_reservations_dates_idx  on pending_reservations(start_date, end_date);

-- subleasing_stays
create index subleasing_stays_apartment_idx on subleasing_stays(apartment_id, check_in_date);
create index subleasing_stays_status_idx    on subleasing_stays(status);
create unique index subleasing_stays_unique
  on subleasing_stays(apartment_id, check_in_date, guest_name);

-- cleaning_staff
create index cleaning_staff_active_idx on cleaning_staff(is_active) where is_active;

-- cleaning_schedules
create index cleaning_schedules_apartment_idx          on cleaning_schedules(apartment_id);
create index cleaning_schedules_external_apartment_idx on cleaning_schedules(external_apartment_id);
create index cleaning_schedules_active_idx             on cleaning_schedules(is_active) where is_active;

-- cleaning_tasks
create index cleaning_tasks_apartment_idx          on cleaning_tasks(apartment_id, scheduled_date);
create index cleaning_tasks_external_apartment_idx on cleaning_tasks(external_apartment_id);
create index cleaning_tasks_status_idx             on cleaning_tasks(status);
create index cleaning_tasks_assigned_idx           on cleaning_tasks(assigned_to);
create index cleaning_tasks_staff_idx              on cleaning_tasks(staff_id);
create index cleaning_tasks_schedule_idx           on cleaning_tasks(schedule_id);
create index cleaning_tasks_stay_idx               on cleaning_tasks(subleasing_stay_id);
create index cleaning_tasks_scheduled_date_idx     on cleaning_tasks(scheduled_date);

-- cleaning_photos
create index cleaning_photos_task_idx on cleaning_photos(cleaning_task_id);

-- communications
create index communications_booking_idx on communications(booking_id);
create index communications_status_idx  on communications(status);

-- audit_log
create index audit_log_entity_idx on audit_log(entity_type, entity_id);
create index audit_log_actor_idx  on audit_log(actor_id);

-- maintenance_visits
create index maintenance_visits_apartment_date_idx
  on maintenance_visits(apartment_id, scheduled_date);
create index maintenance_visits_status_idx on maintenance_visits(status);

-- defects
create index defects_apartment_idx on defects(apartment_id);
create index defects_status_idx    on defects(status);

-- waitlist
create index waitlist_status_idx on waitlist(status);

-- workflow
create index workflow_templates_scope_idx       on workflow_templates(scope, kind);
create index workflow_template_tasks_tpl_idx    on workflow_template_tasks(template_id, position);
create index booking_tasks_booking_idx          on booking_tasks(booking_id, kind, position);
create index booking_tasks_status_idx           on booking_tasks(status, due_date);
create index booking_tasks_assignee_idx         on booking_tasks(assigned_to, status);
create unique index booking_tasks_unique_code
  on booking_tasks(booking_id, kind, code) where code is not null;


-- ============================================================================
-- 6. AUTH-ROLLEN-HELPER
-- (Kommen nach users-Tabelle, lesen von dort.)
-- ============================================================================
create or replace function auth_role()
returns user_role language sql stable as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function is_admin()
returns boolean language sql stable as $$
  select coalesce(auth_role() = 'admin', false)
$$;

create or replace function can_write()
returns boolean language sql stable as $$
  select coalesce(auth_role() in ('admin','office'), false)
$$;

create or replace function is_cleaning()
returns boolean language sql stable as $$
  select coalesce(auth_role() = 'cleaning', false)
$$;


-- ============================================================================
-- 7. RLS aktivieren + Policies
-- ============================================================================

-- RLS auf allen Domain-Tabellen aktivieren
do $$
declare
  tbl text;
  tables text[] := array[
    'users','channels','apartments','apartment_channel_links',
    'tenants','bookings','blocks','payments','communications',
    'maintenance_visits','defects','waitlist',
    'cleaning_tasks','cleaning_photos','cleaning_schedules','cleaning_staff',
    'external_apartments','subleasing_stays',
    'booking_occupants','tenant_documents','pending_reservations',
    'workflow_templates','workflow_template_tasks','booking_tasks',
    'audit_log'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table %I enable row level security', tbl);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- users: jeder sieht sich selbst, Admin sieht alle
-- ----------------------------------------------------------------------------
create policy "users self read"   on users for select using (id = auth.uid() or is_admin());
create policy "users admin write" on users for all    using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Standard-CRUD für Office-Tabellen:
-- Lesen: alle authentifizierten User
-- Schreiben/Update: admin + office
-- Löschen: admin
-- ----------------------------------------------------------------------------
do $$
declare
  tbl text;
  table_list text[] := array[
    'channels','apartments','apartment_channel_links',
    'tenants','bookings','blocks','payments','communications',
    'maintenance_visits','defects','waitlist',
    'external_apartments','subleasing_stays',
    'booking_occupants','tenant_documents','pending_reservations',
    'cleaning_schedules','cleaning_staff',
    'workflow_templates','workflow_template_tasks'
  ];
begin
  foreach tbl in array table_list loop
    execute format(
      'create policy %I on %I for select using (auth.uid() is not null)',
      tbl || ' read auth', tbl);
    execute format(
      'create policy %I on %I for insert with check (can_write())',
      tbl || ' write office', tbl);
    execute format(
      'create policy %I on %I for update using (can_write()) with check (can_write())',
      tbl || ' update office', tbl);
    execute format(
      'create policy %I on %I for delete using (is_admin())',
      tbl || ' delete admin', tbl);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- cleaning_tasks: Reinigungs-Team sieht eigene/offene Aufträge
-- ----------------------------------------------------------------------------
create policy "cleaning_tasks read office"
  on cleaning_tasks for select
  using (can_write() or auth_role() = 'management');

create policy "cleaning_tasks read cleaning"
  on cleaning_tasks for select
  using (is_cleaning() and (assigned_to = auth.uid() or assigned_to is null));

create policy "cleaning_tasks write office"
  on cleaning_tasks for insert with check (can_write());

create policy "cleaning_tasks update office"
  on cleaning_tasks for update using (can_write()) with check (can_write());

create policy "cleaning_tasks update cleaning"
  on cleaning_tasks for update
  using (is_cleaning() and (assigned_to = auth.uid() or assigned_to is null))
  with check (is_cleaning());

create policy "cleaning_tasks delete admin"
  on cleaning_tasks for delete using (is_admin());

-- ----------------------------------------------------------------------------
-- cleaning_photos: gleiche Logik wie cleaning_tasks
-- ----------------------------------------------------------------------------
create policy "cleaning_photos read office"
  on cleaning_photos for select using (can_write() or auth_role() = 'management');

create policy "cleaning_photos read cleaning"
  on cleaning_photos for select
  using (
    is_cleaning() and exists (
      select 1 from cleaning_tasks ct
       where ct.id = cleaning_photos.cleaning_task_id
         and (ct.assigned_to = auth.uid() or ct.assigned_to is null)
    )
  );

create policy "cleaning_photos insert"
  on cleaning_photos for insert with check (
    can_write() or (
      is_cleaning() and exists (
        select 1 from cleaning_tasks ct
         where ct.id = cleaning_task_id
           and (ct.assigned_to = auth.uid() or ct.assigned_to is null)
      )
    )
  );

create policy "cleaning_photos delete admin"
  on cleaning_photos for delete using (is_admin());

-- ----------------------------------------------------------------------------
-- booking_tasks: nur office/admin schreiben, management lesen
-- ----------------------------------------------------------------------------
create policy "booking_tasks read"   on booking_tasks for select using (can_write() or auth_role() = 'management');
create policy "booking_tasks insert" on booking_tasks for insert with check (can_write());
create policy "booking_tasks update" on booking_tasks for update using (can_write()) with check (can_write());
create policy "booking_tasks delete" on booking_tasks for delete using (is_admin());

-- ----------------------------------------------------------------------------
-- audit_log: nur Admin
-- ----------------------------------------------------------------------------
create policy "audit_log admin read" on audit_log for select using (is_admin());
create policy "audit_log insert any" on audit_log for insert with check (auth.uid() is not null);


-- ============================================================================
-- 8. TRIGGERS (updated_at + payment-recompute)
-- ============================================================================

-- updated_at-Trigger für alle Tabellen mit updated_at
do $$
declare
  tbl text;
  tables text[] := array[
    'users','channels','apartments','apartment_channel_links',
    'tenants','bookings','blocks','payments','communications',
    'maintenance_visits','defects','waitlist',
    'cleaning_tasks','cleaning_schedules','cleaning_staff',
    'external_apartments','subleasing_stays',
    'pending_reservations',
    'workflow_templates','workflow_template_tasks','booking_tasks'
  ];
begin
  foreach tbl in array tables loop
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      tbl || '_set_updated_at', tbl);
  end loop;
end $$;

-- Payment-Status: bei jedem payments-INSERT/UPDATE/DELETE
-- bookings.payment_status neu rechnen.
create or replace function recompute_booking_payment_status(p_booking_id uuid)
returns void language plpgsql as $$
declare
  v_total      numeric(12,2);
  v_paid       numeric(12,2);
  v_overdue    int;
  v_new_status booking_payment_status;
begin
  select coalesce(sum(amount),0) into v_total
    from payments where booking_id = p_booking_id and status <> 'cancelled';
  select coalesce(sum(amount),0) into v_paid
    from payments where booking_id = p_booking_id and status = 'paid';
  select count(*) into v_overdue
    from payments where booking_id = p_booking_id and status = 'overdue';

  if v_overdue > 0 then               v_new_status := 'overdue';
  elsif v_paid = 0 then               v_new_status := 'pending';
  elsif v_paid >= v_total then        v_new_status := 'paid';
  else                                v_new_status := 'partial';
  end if;

  update bookings set payment_status = v_new_status where id = p_booking_id;
end;
$$;

create or replace function trg_payments_recompute()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'DELETE') then
    perform recompute_booking_payment_status(old.booking_id);
    return old;
  else
    perform recompute_booking_payment_status(new.booking_id);
    return new;
  end if;
end;
$$;

create trigger payments_recompute_status
after insert or update or delete on payments
for each row execute function trg_payments_recompute();


-- ============================================================================
-- 9. WARTUNGS-FUNKTIONEN
-- ============================================================================
-- Per Cron täglich aufrufen → setzt überfällige Zahlungen auf 'overdue'
-- und triggert die Status-Neuberechnung pro Buchung.
create or replace function mark_overdue_payments()
returns int language plpgsql as $$
declare
  v_booking_id uuid;
  v_count      int := 0;
  v_affected   uuid[];
begin
  with updated as (
    update payments
       set status = 'overdue'
     where status = 'pending'
       and due_date < current_date
    returning booking_id
  )
  select array_agg(distinct booking_id) into v_affected from updated;

  if v_affected is not null then
    foreach v_booking_id in array v_affected loop
      perform recompute_booking_payment_status(v_booking_id);
      v_count := v_count + 1;
    end loop;
  end if;
  return v_count;
end;
$$;


-- ============================================================================
-- 10. VIEWS (Dashboard, Kalender, Status)
-- ============================================================================

-- Aktueller Status pro Wohnung (heute)
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
         when a.status = 'maintenance' then 'maintenance'::apartment_status
         when bt.apartment_id is not null then 'blocked'::apartment_status
         when at.apartment_id is not null then 'occupied'::apartment_status
         else 'available'::apartment_status
       end as effective_status
  from apartments a
  left join active_today  at on at.apartment_id = a.id
  left join blocked_today bt on bt.apartment_id = a.id;

-- Dashboard-KPIs
create or replace view view_dashboard_kpis as
select
  (select count(*) from apartments
     where ownership in ('own','sold_managed'))                                    as total_apartments,
  (select count(*) from view_apartment_status_today
     where ownership in ('own','sold_managed') and effective_status = 'available') as free_apartments,
  (select count(*) from view_apartment_status_today
     where ownership in ('own','sold_managed') and effective_status = 'occupied')  as occupied_apartments,
  (select count(*) from bookings
     where status = 'planned'
       and start_date between current_date and current_date + interval '7 days')   as upcoming_checkins,
  (select count(*) from bookings
     where status in ('active','planned')
       and end_date between current_date and current_date + interval '7 days')     as upcoming_checkouts,
  (select count(*) from cleaning_tasks
     where status in ('open','in_progress'))                                       as open_cleanings,
  (select count(*) from payments
     where status in ('pending','overdue')
       and due_date <= current_date + interval '14 days')                          as open_payments,
  (select count(*) from bookings
     where payment_status = 'overdue'
        or (status = 'planned' and start_date <= current_date + interval '7 days'
            and contract_status <> 'signed'))                                      as needs_attention;

-- Flache Sicht für die Kalender-UI (Buchungen + Blocks)
create or replace view view_occupancy_calendar as
select b.id           as event_id,
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
select bl.id          as event_id,
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


-- ============================================================================
-- 11. STORAGE-BUCKETS + STORAGE-POLICIES
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cleaning-photos',  'cleaning-photos',  false,
   20971520, array['image/png','image/jpeg','image/webp']),
  ('tenant-documents', 'tenant-documents', false,
   20971520, array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- cleaning-photos: lesen alle authentifizierten, schreiben office+cleaning, löschen admin
create policy "cleaning-photos read auth"
  on storage.objects for select
  using (bucket_id = 'cleaning-photos' and auth.uid() is not null);
create policy "cleaning-photos write office or cleaning"
  on storage.objects for insert
  with check (bucket_id = 'cleaning-photos' and (can_write() or is_cleaning()));
create policy "cleaning-photos delete admin"
  on storage.objects for delete
  using (bucket_id = 'cleaning-photos' and is_admin());

-- tenant-documents: lesen alle authentifizierten, schreiben office, löschen admin
create policy "tenant-documents read auth"
  on storage.objects for select
  using (bucket_id = 'tenant-documents' and auth.uid() is not null);
create policy "tenant-documents write office"
  on storage.objects for insert
  with check (bucket_id = 'tenant-documents' and can_write());
create policy "tenant-documents delete admin"
  on storage.objects for delete
  using (bucket_id = 'tenant-documents' and is_admin());


-- ============================================================================
-- 12. WORKFLOW-TEMPLATES SEEDEN
-- (Struktureller Stamm – gehört in die Migration, nicht in seed-prod.sql,
--  damit jedes frische DB-Setup direkt funktioniert.)
-- ============================================================================

-- LANGZEIT EINZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('long_term_move_in', 'Langzeit Einzug', 'move_in', 'long_term',
   'Aufgabenliste vom Eingang Flatfox-Anmeldung bis zur Schlüsselübergabe und Behörden-Meldung.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days,
       v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  ( 1, 'create_contract',         'Vertrag im ImmoERP erstellen',         'Mietvertrag im ImmoERP erfassen.', 'Vertrag',     -14, 'check_in', 'office', false, false, null),
  ( 2, 'check_rent_components',   'Mietzinskomponente prüfen',            'Nettomiete, NK, allfällige Pauschalen prüfen.', 'Vertrag', -14, 'check_in', 'office', false, false, null),
  ( 3, 'parking_contract',        'Parkplatz-Vertrag erstellen',          'Nur falls Parkplatz Teil der Miete ist.', 'Vertrag', -14, 'check_in', 'office', true, true, 'parking_included'),
  ( 4, 'prepare_esr',             'ESR vorbereiten',                      'Einzahlungsschein für erste Miete + Depot vorbereiten.', 'Zahlung', -14, 'check_in', 'office', false, false, null),
  ( 5, 'upload_contract_flatfox', 'Vertrag auf Flatfox laden',            'Zur digitalen Unterzeichnung. Ausnahme: manuelle Unterzeichnung.', 'Vertrag', -12, 'check_in', 'office', false, false, null),
  ( 6, 'check_contract_signed',   'Vertrag-Unterzeichnung prüfen',        'Reminder: bei Verzug nachfassen.', 'Vertrag', -7, 'check_in', 'office', false, false, null),
  ( 7, 'order_name_tags',         'Namensschilder bestellen',             'Briefkasten + Klingel + Wohnungstür.', 'Übergabe', -7, 'check_in', 'office', false, false, null),
  ( 8, 'schedule_handover',       'Übergabetermin festlegen',             'Mit Mieter abstimmen, Reinigung berücksichtigen.', 'Übergabe', -5, 'check_in', 'office', false, false, null),
  ( 9, 'do_handover',             'Wohnung übergeben',                    'Schlüsselübergabe, Protokoll erstellen.', 'Übergabe', 0, 'check_in', 'office', false, false, null),
  (10, 'register_city',           'Mieter bei Stadt anmelden',            'Mutationsformular einreichen.', 'Behörden', 1, 'check_in', 'office', false, false, null),
  (11, 'register_utility',        'Stromanbieter melden',                 'Zählerstand + neuer Mieter.', 'Behörden', 1, 'check_in', 'office', false, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'long_term_move_in';

-- LANGZEIT AUSZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('long_term_move_out', 'Langzeit Auszug', 'move_out', 'long_term',
   'Aufgabenliste von Kündigungseingang bis Depot-Rückzahlung und Archivierung.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days,
       v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  ( 1, 'log_termination',               'Kündigung im ImmoERP eintragen',  'Eingangsdatum + Kündigungsdatum erfassen.', 'Kündigung', -90, 'check_out', 'office', false, false, null),
  ( 2, 'send_termination_confirmation', 'Kündigungsbestätigung senden',    'Schriftliche Bestätigung an Mieter.',       'Kündigung', -89, 'check_out', 'office', false, false, null),
  ( 3, 'list_apartment',                'Wohnung ausschreiben',            'Inserat auf Flatfox / Homegate / Website.', 'Vermarktung', -60, 'check_out', 'office', false, false, null),
  ( 4, 'schedule_inspection',           'Abnahmetermin vereinbaren',       'Mit Mieter abstimmen.',                     'Übergabe',  -14, 'check_out', 'office', false, false, null),
  ( 5, 'do_inspection',                 'Wohnung abnehmen',                'Übergabeprotokoll erstellen, Schäden dokumentieren.', 'Übergabe', 0, 'check_out', 'office', false, false, null),
  ( 6, 'repair_damages',                'Schäden reparieren',              'Falls bei Abnahme Schäden festgestellt.',   'Reparatur',  7, 'check_out', 'office', true,  true,  'damage_found'),
  ( 7, 'invoice_damages',               'Schaden-Rechnung stellen',        'Reparaturkosten an Mieter weiterverrechnen.','Zahlung',  14, 'check_out', 'office', true,  true,  'damage_found'),
  ( 8, 'check_open_invoices',           'Offene Posten prüfen',            'Letzte Miete, NK, Rechnungen.',             'Zahlung',   21, 'check_out', 'office', false, false, null),
  ( 9, 'release_deposit',               'Depot zurückzahlen',              'Mietkautionsversicherung auflösen ODER Vergütungsauftrag Bankdepot.', 'Depot', 30, 'check_out', 'office', false, false, null),
  (10, 'archive_files',                 'Akten archivieren',               'Vertrag + Protokolle + Korrespondenz ablegen.', 'Abschluss', 45, 'check_out', 'office', false, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'long_term_move_out';

-- KURZZEIT EINZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('short_term_move_in', 'Kurzzeit Einzug', 'move_in', 'short_term',
   'Vereinfachte Aufgabenliste für 1–3 Monate Kurzzeitmiete.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days,
       v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  (1, 'create_contract',     'Vertrag im ImmoERP erstellen',        'Kurzzeitmietvertrag.', 'Vertrag', -7, 'check_in', 'office', false, false, null),
  (2, 'check_flat_rate',     'Kurzzeitpauschale prüfen',            'Pauschale + Mietzins + NK korrekt erfasst.', 'Vertrag', -7, 'check_in', 'office', false, false, null),
  (3, 'prepare_deposit_esr', 'Depot-Einzahlungsschein vorbereiten', 'Separates Depotkonto (nicht Flatfox).', 'Zahlung', -7, 'check_in', 'office', false, false, null),
  (4, 'send_contract',       'Vertrag zur Unterzeichnung senden',   'PDF an Mieter.', 'Vertrag', -5, 'check_in', 'office', false, false, null),
  (5, 'check_payment',       'Eingang Miete + Depot prüfen',        'Vor Übergabe.', 'Zahlung', -2, 'check_in', 'office', false, false, null),
  (6, 'schedule_handover',   'Übergabetermin festlegen',            null, 'Übergabe', -3, 'check_in', 'office', false, false, null),
  (7, 'do_handover',         'Wohnung übergeben',                   'Schlüsselübergabe + Kurz-Briefing (WLAN, Müll, etc.).', 'Übergabe', 0, 'check_in', 'office', false, false, null),
  (8, 'register_city',       'Stadt-Anmeldung prüfen',              'Bei Aufenthalt > 90 Tage erforderlich.', 'Behörden', 1, 'check_in', 'office', true, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'short_term_move_in';

-- KURZZEIT AUSZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('short_term_move_out', 'Kurzzeit Auszug', 'move_out', 'short_term',
   'Vereinfachte Auszugs-Aufgabenliste für Kurzzeitmieter.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days,
       v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  (1, 'schedule_inspection', 'Abnahmetermin vereinbaren', null, 'Übergabe', -3, 'check_out', 'office', false, false, null),
  (2, 'do_inspection',       'Wohnung abnehmen',          'Schäden dokumentieren.', 'Übergabe', 0, 'check_out', 'office', false, false, null),
  (3, 'repair_damages',      'Schäden reparieren',        null, 'Reparatur', 5, 'check_out', 'office', true, true, 'damage_found'),
  (4, 'invoice_damages',     'Schaden-Rechnung stellen',  null, 'Zahlung', 7, 'check_out', 'office', true, true, 'damage_found'),
  (5, 'release_deposit',     'Depot zurückzahlen',        'Vom separaten Depotkonto.', 'Depot', 14, 'check_out', 'office', false, false, null),
  (6, 'archive_files',       'Akten archivieren',         null, 'Abschluss', 21, 'check_out', 'office', false, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'short_term_move_out';

-- BOOKING EINZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('booking_move_in', 'Booking Einzug', 'move_in', 'booking',
   'Minimaler Workflow für Booking.com / Airbnb / Direktbuchungen.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days,
       v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  (1, 'assign_apartment',  'Wohnung zuweisen',     'Falls noch nicht automatisch zugewiesen.', 'Reservation', -3, 'check_in', 'office', false, false, null),
  (2, 'send_arrival_info', 'Anreise-Infos senden', 'WLAN, Schlüsselbox, Adresse.', 'Übergabe', -2, 'check_in', 'office', false, false, null),
  (3, 'check_payment',     'Zahlungseingang prüfen','Booking-Auszahlung / Direktzahlung.', 'Zahlung', 1, 'check_in', 'office', false, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'booking_move_in';

-- BOOKING AUSZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('booking_move_out', 'Booking Auszug', 'move_out', 'booking',
   'Minimaler Auszugs-Workflow für Booking-Gäste.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days,
       v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  (1, 'check_cleaning',       'Reinigung sicherstellen',     'Auftrag wurde automatisch erzeugt.', 'Reinigung', 0, 'check_out', 'office', false, false, null),
  (2, 'check_inspection',     'Inspektion / Schäden prüfen', 'Falls nötig Foto-Doku.', 'Übergabe', 0, 'check_out', 'office', false, false, null),
  (3, 'check_booking_payout', 'Booking-Auszahlung prüfen',   'Eingang vom Channel kontrollieren.', 'Zahlung', 14, 'check_out', 'office', false, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'booking_move_out';
