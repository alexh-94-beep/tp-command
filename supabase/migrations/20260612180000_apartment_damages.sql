-- Phase 13.6: Schäden als eigene Tabelle pro Wohnung
--
-- Aktuell wird ein Schaden direkt auf cleaning_tasks.damage_found gespeichert
-- (1 pro Reinigung). User-Anforderung aus der Sitzung 12.6.: pro Wohnung
-- sollen mehrere parallele Schäden mit eigener Historie führbar sein,
-- unabhängig von der jeweiligen Reinigung.
--
-- Schäden können:
--   - direkt auf einer eigenen oder externen Wohnung erfasst werden
--   - optional einer Reinigung zugeordnet sein (in der der Schaden entdeckt
--     wurde)
--   - eigenen Status durchlaufen (open / in_progress / resolved / wont_fix)
--   - eine Schwere (minor / normal / major / urgent) haben
--   - mit Foto-URL versehen werden (Upload kommt in einer späteren Phase)

create type apartment_damage_severity as enum (
  'minor',
  'normal',
  'major',
  'urgent'
);

create type apartment_damage_status as enum (
  'open',
  'in_progress',
  'resolved',
  'wont_fix'
);

create table apartment_damages (
  id                      uuid primary key default gen_random_uuid(),
  apartment_id            uuid references apartments(id) on delete cascade,
  external_apartment_id   uuid references external_apartments(id) on delete cascade,
  cleaning_task_id        uuid references cleaning_tasks(id) on delete set null,
  description             text not null,
  severity                apartment_damage_severity not null default 'normal',
  status                  apartment_damage_status not null default 'open',
  photo_url               text,
  notes                   text,
  reported_by             uuid references users(id) on delete set null,
  reported_at             timestamptz not null default now(),
  resolved_by             uuid references users(id) on delete set null,
  resolved_at             timestamptz,
  resolution_notes        text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Genau eine Wohnungs-Referenz Pflicht
  constraint apartment_damages_one_apartment check (
    (apartment_id is not null and external_apartment_id is null) or
    (apartment_id is null and external_apartment_id is not null)
  )
);

create index apartment_damages_apartment_idx on apartment_damages(apartment_id, status);
create index apartment_damages_external_idx on apartment_damages(external_apartment_id, status);
create index apartment_damages_cleaning_idx on apartment_damages(cleaning_task_id);

-- updated_at-Trigger
create or replace function trg_apartment_damages_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger apartment_damages_set_updated_at
before update on apartment_damages
for each row execute function trg_apartment_damages_updated_at();

-- RLS
alter table apartment_damages enable row level security;

create policy apartment_damages_admin_office_all
  on apartment_damages
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

-- Cleaning-User können Schäden lesen + neue melden (aus dem Auftrag heraus),
-- aber nicht löschen oder fremde bearbeiten.
create policy apartment_damages_cleaning_read
  on apartment_damages
  for select
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
  );

create policy apartment_damages_cleaning_insert
  on apartment_damages
  for insert
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
    and reported_by = auth.uid()
  );
