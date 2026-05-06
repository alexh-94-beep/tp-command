-- ============================================================
-- Reinigungs-Erweiterung:
--   - bookings.handover_completed_at / handover_by   (Wohnungsabnahme)
--   - cleaning_schedules                             (wiederkehrende Reinigung)
--   - external_apartments                            (Eigentumswohnungen ausserhalb Bestand)
--   - cleaning_tasks erweitert: external_apartment_id (alternativ zu apartment_id)
-- ============================================================

-- Buchung: Abnahme bei Langzeit-Auszug
alter table bookings
  add column handover_completed_at timestamptz,
  add column handover_by           uuid references users(id);

-- Wiederkehrende Reinigung
create type cleaning_frequency as enum ('weekly', 'biweekly');

create table cleaning_schedules (
  id                       uuid primary key default gen_random_uuid(),
  apartment_id             uuid references apartments(id) on delete cascade,
  external_apartment_id    uuid,                                -- FK kommt nach Tabelle unten
  frequency                cleaning_frequency not null,
  weekday                  int not null check (weekday between 0 and 6),  -- 0 = Sonntag
  start_date               date not null default current_date,
  end_date                 date,
  default_assignee         uuid references users(id),
  notes                    text,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Genau eines der beiden FKs setzen
  constraint cleaning_schedules_target_chk
    check ((apartment_id is not null) <> (external_apartment_id is not null))
);
create index cleaning_schedules_apartment_idx       on cleaning_schedules(apartment_id);
create index cleaning_schedules_external_apartment_idx on cleaning_schedules(external_apartment_id);
create index cleaning_schedules_active_idx          on cleaning_schedules(is_active) where is_active;
create trigger cleaning_schedules_set_updated_at before update on cleaning_schedules
  for each row execute function set_updated_at();

-- Externe Wohnungen (Eigentum ausserhalb Mietbestand, nur für Reinigung)
create table external_apartments (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,             -- z.B. "C.0501 (Familie Xu)"
  address     text,
  contact     text,                      -- Eigentümer-Kontakt
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger external_apartments_set_updated_at before update on external_apartments
  for each row execute function set_updated_at();

-- FK von cleaning_schedules → external_apartments nachträglich, weil Tabelle erst jetzt existiert
alter table cleaning_schedules
  add constraint cleaning_schedules_external_fk
    foreign key (external_apartment_id) references external_apartments(id) on delete cascade;

-- cleaning_tasks: optional auf externe Wohnung zeigen
alter table cleaning_tasks
  add column external_apartment_id uuid references external_apartments(id) on delete set null,
  add column schedule_id           uuid references cleaning_schedules(id) on delete set null,
  alter column apartment_id drop not null,
  add constraint cleaning_tasks_target_chk
    check ((apartment_id is not null) <> (external_apartment_id is not null));

create index cleaning_tasks_external_apartment_idx on cleaning_tasks(external_apartment_id);
create index cleaning_tasks_schedule_idx on cleaning_tasks(schedule_id);
create index cleaning_tasks_scheduled_date_idx on cleaning_tasks(scheduled_date);

-- RLS für die neuen Tabellen
alter table cleaning_schedules enable row level security;
alter table external_apartments enable row level security;

create policy "cleaning_schedules read auth"
  on cleaning_schedules for select using (auth.uid() is not null);
create policy "cleaning_schedules write office"
  on cleaning_schedules for insert with check (can_write());
create policy "cleaning_schedules update office"
  on cleaning_schedules for update using (can_write()) with check (can_write());
create policy "cleaning_schedules delete admin"
  on cleaning_schedules for delete using (is_admin());

create policy "external_apartments read auth"
  on external_apartments for select using (auth.uid() is not null);
create policy "external_apartments write office"
  on external_apartments for insert with check (can_write());
create policy "external_apartments update office"
  on external_apartments for update using (can_write()) with check (can_write());
create policy "external_apartments delete admin"
  on external_apartments for delete using (is_admin());
