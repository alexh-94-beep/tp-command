-- ============================================================================
-- tenant_kind um 'company' erweitern + Schema flexibilisieren
-- ----------------------------------------------------------------------------
-- Hintergrund: Cityus mietet als juristische Person 34 Wohnungen. Der bisherige
-- tenant_kind-Enum kannte nur 'tenant' und 'guest'. Wir fuegen 'company' hinzu
-- und machen first_name/last_name nullable, weil eine Firma keinen Vornamen hat.
-- Stattdessen kommt ein neues Feld company_name fuer Firmenmieter.
--
-- Hinweis: ALTER TYPE ... ADD VALUE laeuft in einer eigenen Transaktion (Postgres-
-- Eigenheit). Da wir noch keine Tenants in der DB haben, ist das unkritisch.
-- ============================================================================

-- 1. Enum erweitern
alter type tenant_kind add value if not exists 'company';

-- 2. Spalten flexibilisieren
alter table tenants alter column first_name drop not null;
alter table tenants alter column last_name  drop not null;

-- 3. Company-Name fuer juristische Personen
alter table tenants add column if not exists company_name text;

-- 4. Konsistenz: entweder Person (Vor- + Nachname) ODER Company (company_name)
alter table tenants add constraint tenants_name_kind_chk check (
  (tenant_kind = 'company' and company_name is not null)
  or
  (tenant_kind in ('tenant', 'guest') and first_name is not null and last_name is not null)
);

-- 5. Index fuer Company-Suche
create index if not exists tenants_company_name_idx on tenants(company_name)
  where tenant_kind = 'company';
