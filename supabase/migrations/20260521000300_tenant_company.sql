-- ============================================================================
-- tenants: Schema fuer Firmenmieter flexibilisieren
-- ----------------------------------------------------------------------------
-- Setzt auf 20260521000200_tenant_kind_company_value.sql auf (Enum-Wert
-- 'company' ist dort bereits committet und darf hier verwendet werden).
--
-- Eine Firma hat keinen Vor-/Nachnamen -> first_name/last_name werden nullable,
-- stattdessen kommt company_name fuer juristische Personen.
-- ============================================================================

-- Spalten flexibilisieren
alter table tenants alter column first_name drop not null;
alter table tenants alter column last_name drop not null;

-- Company-Name fuer juristische Personen
alter table tenants add column if not exists company_name text;

-- Konsistenz: entweder Person (Vor- + Nachname) ODER Company (company_name)
alter table tenants add constraint tenants_name_kind_chk check (
  (tenant_kind = 'company' and company_name is not null)
  or
  (tenant_kind in ('tenant', 'guest') and first_name is not null and last_name is not null)
);

-- Index fuer Company-Suche
create index if not exists tenants_company_name_idx on tenants(company_name)
  where tenant_kind = 'company';
