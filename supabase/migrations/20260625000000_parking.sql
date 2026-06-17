-- Phase 24: Parkplatz-Modul
--
-- Spiegelt die ~97 Tiefgaragen-Stellplaetze, die formal in W&W
-- verwaltet werden, in der Plattform. Hauptzweck: keine Doppelbuchung,
-- wenn ein Leerstand-Slot fuer einen Booking.com-Gast genutzt wird und
-- W&W-Kommentare uebersehen werden.
--
-- Quellsystem (W&W): Dauer-Mietverhaeltnisse aus dem Mieterspiegel-XLS.
-- Quellsystem (TP-Command): Kurzfrist-Belegungen fuer Booking-Gaeste.
--
-- DB-Schutz gegen Doppelbelegung: EXCLUDE-Constraint auf
-- (parking_spot_id, daterange) — verhindert ueberlappende active rows.

create extension if not exists btree_gist;

-- ── ENUM: Belegungsart ───────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'parking_assignment_kind'
  ) then
    create type parking_assignment_kind as enum (
      'long_term',    -- Dauer-Mietverhaeltnis aus W&W
      'booking',      -- Kurzfrist fuer Booking.com-Gast
      'other_block'   -- Reserviert/blockiert (Reinigung, Schaden, etc.)
    );
  end if;
end $$;

-- ── ENUM: Datenquelle ────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'parking_assignment_source'
  ) then
    create type parking_assignment_source as enum (
      'w_w',          -- aus W&W-Mieterspiegel importiert
      'tp_command'    -- in unserer Plattform erfasst
    );
  end if;
end $$;

-- ── parking_spots ────────────────────────────────────────────────────
create table if not exists parking_spots (
  id uuid primary key default gen_random_uuid(),
  number int not null unique,
  building_label text,
  -- Flag: dieser PP darf fuer Booking-Gaeste vergeben werden, auch wenn
  -- formal ein Dauer-Mietverhaeltnis besteht (z.B. TPB-Slots, die TP
  -- selbst gemietet hat und Gaesten zur Verfuegung stellt).
  is_booking_pool boolean not null default false,
  is_active boolean not null default true,
  -- Plattform-interne Notizen, die NICHT vom W&W-Reimport ueberschrieben werden
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parking_spots_number_idx on parking_spots(number);
create index if not exists parking_spots_booking_pool_idx on parking_spots(is_booking_pool) where is_booking_pool;

-- ── parking_assignments ──────────────────────────────────────────────
create table if not exists parking_assignments (
  id uuid primary key default gen_random_uuid(),
  parking_spot_id uuid not null references parking_spots(id) on delete cascade,
  kind parking_assignment_kind not null,
  source parking_assignment_source not null,
  -- Mieter / Gast / Block-Grund
  tenant_label text,
  -- Optional: Verknuepfung mit Tenant-Datensatz in der Plattform
  tenant_id uuid references tenants(id) on delete set null,
  -- Optional: Verknuepfung mit einer konkreten Buchung (fuer kind='booking')
  booking_id uuid references bookings(id) on delete cascade,
  -- W&W-Mieter-Nr (z.B. '10012')
  external_ref text,
  start_date date not null,
  end_date date not null,
  monthly_rent numeric(10, 2),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- DB-Schutz: keine ueberlappenden aktiven Belegungen pro PP.
-- '[)' = inklusive Start, exklusiv Ende (Auszugstag wieder frei).
-- partial WHERE is_active: archivierte/stornierte Belegungen behindern nicht.
alter table parking_assignments
  drop constraint if exists parking_assignments_no_overlap;
alter table parking_assignments
  add constraint parking_assignments_no_overlap
  exclude using gist (
    parking_spot_id with =,
    daterange(start_date, end_date, '[)') with &&
  ) where (is_active);

alter table parking_assignments
  drop constraint if exists parking_assignments_end_after_start;
alter table parking_assignments
  add constraint parking_assignments_end_after_start
  check (end_date > start_date);

create index if not exists parking_assignments_spot_idx on parking_assignments(parking_spot_id);
create index if not exists parking_assignments_booking_idx on parking_assignments(booking_id) where booking_id is not null;
create index if not exists parking_assignments_active_range_idx on parking_assignments(parking_spot_id, start_date, end_date) where is_active;

-- ── updated_at triggers ──────────────────────────────────────────────
create or replace function trg_parking_spots_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists parking_spots_updated_at on parking_spots;
create trigger parking_spots_updated_at
before update on parking_spots
for each row execute function trg_parking_spots_updated_at();

create or replace function trg_parking_assignments_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists parking_assignments_updated_at on parking_assignments;
create trigger parking_assignments_updated_at
before update on parking_assignments
for each row execute function trg_parking_assignments_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────
alter table parking_spots enable row level security;
alter table parking_assignments enable row level security;

-- Admin / Office / Management: voller Zugriff
create policy parking_spots_admin_office_all
  on parking_spots
  for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'office', 'management')
    )
  )
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'office', 'management')
    )
  );

create policy parking_assignments_admin_office_all
  on parking_assignments
  for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'office', 'management')
    )
  )
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'office', 'management')
    )
  );

-- Cleaning (Mireme): lesen + is_booking_pool + notes_internal flaggen
create policy parking_spots_cleaning_read
  on parking_spots
  for select
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
  );

create policy parking_spots_cleaning_update
  on parking_spots
  for update
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
  )
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
  );

-- Cleaning: Booking-Belegungen lesen + erstellen + (eigene) deaktivieren.
-- Long_term/W&W bleibt fuer cleaning read-only (über Service-Layer geblockt).
create policy parking_assignments_cleaning_read
  on parking_assignments
  for select
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
  );

create policy parking_assignments_cleaning_booking_insert
  on parking_assignments
  for insert
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
    and kind = 'booking'
    and source = 'tp_command'
  );

create policy parking_assignments_cleaning_booking_update
  on parking_assignments
  for update
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
    and kind = 'booking'
  )
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
    and kind = 'booking'
  );
