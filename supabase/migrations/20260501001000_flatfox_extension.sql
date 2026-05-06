-- ============================================================
-- Erweiterung für Flatfox-Anmeldungen:
--  - tenants: Personalien, Beruf, Erwerb, Vermieter-Referenz, Roh-Daten
--  - booking_occupants: mehrere Bewohner pro Buchung
--  - tenant_documents: Anhänge (Pass, Lohnausweis, ...)
-- ============================================================

-- Enums
create type civil_status       as enum (
  'single','married','divorced','widowed','partnership','separated','unknown'
);
create type gender             as enum ('male','female','other','unknown');
create type residence_permit   as enum ('C','B','L','F','G','N','S','CH','EU','other','none');
create type employment_status  as enum (
  'employed','self_employed','retired','student','unemployed','other','unknown'
);
create type occupant_role      as enum (
  'main_tenant','co_tenant','partner','child','roommate','other'
);
create type tenant_document_type as enum (
  'passport','id_card','residence_permit','salary_slip','tax_certificate',
  'debt_collection_certificate','flatfox_application','contract','other'
);

-- ------------------------------------------------------------
-- tenants erweitern
-- ------------------------------------------------------------
alter table tenants
  add column civil_status            civil_status,
  add column gender                  gender,
  add column residence_permit        residence_permit,
  add column heimatort               text,           -- nur CH-Bürger
  add column profession              text,           -- Beruf / Titel
  add column employer                text,
  add column employment_status       employment_status,
  add column annual_income           numeric(12,2),
  add column has_debt_collection     boolean,        -- Betreibungsverfahren ja/nein
  add column previous_landlord       text,
  add column previous_landlord_phone text,
  add column previous_landlord_email text,
  add column flatfox_raw             jsonb;          -- Original-Datensatz aus Flatfox

-- ------------------------------------------------------------
-- booking_occupants: N:M zwischen bookings und tenants
-- ------------------------------------------------------------
create table booking_occupants (
  booking_id     uuid not null references bookings(id) on delete cascade,
  tenant_id      uuid not null references tenants(id) on delete restrict,
  role           occupant_role not null default 'co_tenant',
  is_main_tenant boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now(),
  primary key (booking_id, tenant_id)
);
create index booking_occupants_tenant_idx on booking_occupants(tenant_id);

-- Maximal ein Hauptmieter pro Buchung
create unique index booking_occupants_one_main
  on booking_occupants(booking_id) where is_main_tenant;

-- ------------------------------------------------------------
-- tenant_documents: Anhänge
-- ------------------------------------------------------------
create table tenant_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade,
  booking_id    uuid references bookings(id) on delete set null,
  type          tenant_document_type not null default 'other',
  filename      text not null,
  storage_path  text not null,             -- Pfad in Storage-Bucket "tenant-documents"
  mime_type     text,
  size_bytes    int,
  uploaded_by   uuid references users(id),
  uploaded_at   timestamptz not null default now()
);
create index tenant_documents_tenant_idx on tenant_documents(tenant_id);
create index tenant_documents_booking_idx on tenant_documents(booking_id);

-- ------------------------------------------------------------
-- RLS für die neuen Tabellen
-- ------------------------------------------------------------
alter table booking_occupants enable row level security;
alter table tenant_documents  enable row level security;

create policy "booking_occupants read auth"
  on booking_occupants for select using (auth.uid() is not null);
create policy "booking_occupants write office"
  on booking_occupants for insert with check (can_write());
create policy "booking_occupants update office"
  on booking_occupants for update using (can_write()) with check (can_write());
create policy "booking_occupants delete admin"
  on booking_occupants for delete using (is_admin());

create policy "tenant_documents read auth"
  on tenant_documents for select using (auth.uid() is not null);
create policy "tenant_documents write office"
  on tenant_documents for insert with check (can_write());
create policy "tenant_documents update office"
  on tenant_documents for update using (can_write()) with check (can_write());
create policy "tenant_documents delete admin"
  on tenant_documents for delete using (is_admin());

-- ------------------------------------------------------------
-- Storage-Bucket "tenant-documents" anlegen (falls noch nicht da)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-documents',
  'tenant-documents',
  false,
  20971520,                                  -- 20 MB
  array['application/pdf','image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

create policy "tenant-documents read auth"
  on storage.objects for select
  using (bucket_id = 'tenant-documents' and auth.uid() is not null);

create policy "tenant-documents write office"
  on storage.objects for insert
  with check (bucket_id = 'tenant-documents' and can_write());

create policy "tenant-documents delete admin"
  on storage.objects for delete
  using (bucket_id = 'tenant-documents' and is_admin());
