-- Phase 14c: Rechnungen / Debitoren
--
-- Office erfasst Rechnungs-Entwuerfe, die Buchhalterin (Sharon) sieht
-- sobald 'final' und markiert nach Erstellung im Buchhaltungs-System
-- als 'created'.
--
-- Pflichtfelder (laut Sitzung):
--   Name, Vorname, Adresse, Datum Leistung, Betreff, Beschreib, Betrag.
--   Objekt (apartment_id) optional — wenn gewaehlt, kann Adresse aus
--   der Wohnung gefuellt werden, ist aber ueberschreibbar (Freitext).
--
-- Status-Flow:
--   draft     – beliebige Aenderungen, Pflichtfelder optional
--   final     – Pflichtfelder validiert in der Server-Action; Sharon
--               kann jetzt die echte Rechnung im Buchhaltungs-System
--               erstellen
--   created   – Sharon hat die Rechnung erstellt und versendet

create type debitor_invoice_status as enum (
  'draft',
  'final',
  'created'
);

create table debitor_invoices (
  id              uuid primary key default gen_random_uuid(),
  status          debitor_invoice_status not null default 'draft',

  -- Empfaenger
  last_name       text,
  first_name      text,
  address         text,

  -- Bezug zur Wohnung (optional — Default-Adresse wird im UI gefuellt)
  apartment_id    uuid references apartments(id) on delete set null,

  -- Inhalt
  service_date    date,
  subject         text,
  description     text,
  amount_chf      numeric(12, 2),

  -- Anhang (URL/Storage-Path optional)
  attachment_url  text,
  attachment_name text,

  -- Audit
  created_by      uuid references users(id) on delete set null,
  finalized_at    timestamptz,
  finalized_by    uuid references users(id) on delete set null,
  invoiced_at     timestamptz,
  invoiced_by     uuid references users(id) on delete set null,
  invoice_number  text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index debitor_invoices_status_idx on debitor_invoices(status, created_at desc);
create index debitor_invoices_apartment_idx on debitor_invoices(apartment_id);
create index debitor_invoices_creator_idx on debitor_invoices(created_by);

-- updated_at-Trigger
create or replace function trg_debitor_invoices_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger debitor_invoices_set_updated_at
before update on debitor_invoices
for each row execute function trg_debitor_invoices_updated_at();

-- RLS: admin/office/management volle Rechte
alter table debitor_invoices enable row level security;

create policy debitor_invoices_admin_office_all
  on debitor_invoices
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
