-- Phase 13.5: Externe Eigentümer mit n Wohnungen
--
-- Aktuell ist Kontaktdaten direkt in external_apartments (1:1 Kontakt pro
-- Wohnung). Neu: Eigentümer als eigene Tabelle, eine Wohnung hat einen
-- optionalen Eigentümer, ein Eigentümer hat 1..n Wohnungen.
--
-- Bestehende Kontakt-Felder auf external_apartments bleiben als Fallback
-- (z.B. wenn historisch noch kein Owner zugewiesen ist).

create table external_owners (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_phone text,
  contact_email text,
  address       text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table external_apartments
  add column owner_id uuid references external_owners(id) on delete set null;

create index external_apartments_owner_idx on external_apartments(owner_id);
create index external_owners_name_idx on external_owners(name);

-- updated_at-Trigger
create or replace function trg_external_owners_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger external_owners_set_updated_at
before update on external_owners
for each row execute function trg_external_owners_updated_at();

-- RLS: admin/office volle Rechte; cleaning nur Read (damit sie im Detail
-- den Eigentümer-Namen sehen)
alter table external_owners enable row level security;

create policy external_owners_admin_office_all
  on external_owners
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

create policy external_owners_cleaning_read
  on external_owners
  for select
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
  );
