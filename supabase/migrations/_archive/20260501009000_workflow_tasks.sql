-- ============================================================
-- Workflow / Aufgabenlisten pro Buchung
--   - workflow_templates:        Vorlage z.B. "Langzeit Einzug"
--   - workflow_template_tasks:   Einzelne Schritte einer Vorlage
--   - booking_tasks:             Konkrete Aufgaben einer Buchung
--
-- Idee:
-- Beim Anlegen einer Buchung werden alle Schritte der zur
-- rental_type passenden Templates (move_in + move_out) als
-- booking_tasks instanziiert. Das Office-Team hakt sie ab.
-- ============================================================

-- Enums
create type workflow_kind  as enum ('move_in', 'move_out');
create type workflow_scope as enum ('long_term', 'short_term', 'booking', 'all');

create type booking_task_status as enum (
  'open',           -- offen
  'in_progress',    -- in Arbeit
  'done',           -- erledigt
  'skipped',        -- nicht relevant
  'na'              -- nicht zutreffend (z.B. Parkplatz, wenn keiner)
);

create type task_due_anchor as enum (
  'created',        -- relativ zum Erstellungsdatum der Buchung
  'check_in',       -- relativ zu start_date
  'check_out'       -- relativ zu end_date
);

create type task_assignee_role as enum (
  'office',         -- Vermietung / Office
  'admin',          -- Geschäftsleitung
  'cleaning',       -- Reinigung
  'any'             -- alle dürfen
);

-- ------------------------------------------------------------
-- Templates
-- ------------------------------------------------------------
create table workflow_templates (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,           -- z.B. 'long_term_move_in'
  name          text not null,
  kind          workflow_kind not null,
  scope         workflow_scope not null,        -- für welche rental_type
  description   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index workflow_templates_scope_idx on workflow_templates(scope, kind);
create trigger workflow_templates_set_updated_at before update on workflow_templates
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Template-Schritte
-- ------------------------------------------------------------
create table workflow_template_tasks (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references workflow_templates(id) on delete cascade,
  position        int not null,
  code            text not null,                -- stabiler Identifier, z.B. 'create_contract'
  title           text not null,
  description     text,
  category        text,                         -- 'Vertrag', 'Übergabe', 'Behörden', 'Depot', 'Reinigung'
  due_offset_days int not null default 0,       -- relativ zum Anker
  due_anchor      task_due_anchor not null default 'check_in',
  assignee_role   task_assignee_role not null default 'office',
  is_optional     boolean not null default false,
  is_conditional  boolean not null default false, -- z.B. nur wenn Parkplatz
  condition_key   text,                         -- 'parking_included' | 'damage_found' etc.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(template_id, code)
);
create index workflow_template_tasks_tpl_idx on workflow_template_tasks(template_id, position);
create trigger workflow_template_tasks_set_updated_at before update on workflow_template_tasks
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Booking-Aufgaben (Instanzen)
-- ------------------------------------------------------------
create table booking_tasks (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references bookings(id) on delete cascade,
  template_task_id  uuid references workflow_template_tasks(id) on delete set null,
  template_id       uuid references workflow_templates(id) on delete set null,
  kind              workflow_kind not null,
  position          int not null,
  code              text,                         -- aus Template oder leer (manuell)
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
create index booking_tasks_booking_idx  on booking_tasks(booking_id, kind, position);
create index booking_tasks_status_idx   on booking_tasks(status, due_date);
create index booking_tasks_assignee_idx on booking_tasks(assigned_to, status);
create unique index booking_tasks_unique_code
  on booking_tasks(booking_id, kind, code) where code is not null;
create trigger booking_tasks_set_updated_at before update on booking_tasks
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table workflow_templates       enable row level security;
alter table workflow_template_tasks  enable row level security;
alter table booking_tasks            enable row level security;

-- Templates: alle authentifizierten dürfen lesen, nur admin/office schreiben
create policy "wt read auth"   on workflow_templates       for select using (auth.uid() is not null);
create policy "wt write office" on workflow_templates      for insert with check (can_write());
create policy "wt update office" on workflow_templates     for update using (can_write()) with check (can_write());
create policy "wt delete admin" on workflow_templates      for delete using (is_admin());

create policy "wtt read auth"   on workflow_template_tasks for select using (auth.uid() is not null);
create policy "wtt write office" on workflow_template_tasks for insert with check (can_write());
create policy "wtt update office" on workflow_template_tasks for update using (can_write()) with check (can_write());
create policy "wtt delete admin" on workflow_template_tasks for delete using (is_admin());

-- Booking-Tasks: office/admin lesen + schreiben, management nur lesen
create policy "bt read"        on booking_tasks for select using (can_write() or auth_role() = 'management');
create policy "bt insert"      on booking_tasks for insert with check (can_write());
create policy "bt update"      on booking_tasks for update using (can_write()) with check (can_write());
create policy "bt delete"      on booking_tasks for delete using (is_admin());

-- ------------------------------------------------------------
-- Templates seeden
-- ------------------------------------------------------------

-- LANGZEIT EINZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('long_term_move_in', 'Langzeit Einzug', 'move_in', 'long_term',
   'Aufgabenliste vom Eingang Flatfox-Anmeldung bis zur Schlüsselübergabe und Behörden-Meldung.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days, v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  ( 1, 'create_contract',      'Vertrag im ImmoERP erstellen',           'Mietvertrag im ImmoERP erfassen.', 'Vertrag',     -14, 'check_in', 'office', false, false, null),
  ( 2, 'check_rent_components', 'Mietzinskomponente prüfen',              'Nettomiete, NK, allfällige Pauschalen prüfen.', 'Vertrag', -14, 'check_in', 'office', false, false, null),
  ( 3, 'parking_contract',     'Parkplatz-Vertrag erstellen',            'Nur falls Parkplatz Teil der Miete ist.', 'Vertrag', -14, 'check_in', 'office', true, true, 'parking_included'),
  ( 4, 'prepare_esr',          'ESR vorbereiten',                        'Einzahlungsschein für erste Miete + Depot vorbereiten.', 'Zahlung', -14, 'check_in', 'office', false, false, null),
  ( 5, 'upload_contract_flatfox', 'Vertrag auf Flatfox laden',           'Zur digitalen Unterzeichnung. Ausnahme: manuelle Unterzeichnung.', 'Vertrag', -12, 'check_in', 'office', false, false, null),
  ( 6, 'check_contract_signed', 'Vertrag-Unterzeichnung prüfen',         'Reminder: bei Verzug nachfassen.', 'Vertrag', -7, 'check_in', 'office', false, false, null),
  ( 7, 'order_name_tags',      'Namensschilder bestellen',               'Briefkasten + Klingel + Wohnungstür.', 'Übergabe', -7, 'check_in', 'office', false, false, null),
  ( 8, 'schedule_handover',    'Übergabetermin festlegen',               'Mit Mieter abstimmen, Reinigung berücksichtigen.', 'Übergabe', -5, 'check_in', 'office', false, false, null),
  ( 9, 'do_handover',          'Wohnung übergeben',                      'Schlüsselübergabe, Protokoll erstellen.', 'Übergabe', 0, 'check_in', 'office', false, false, null),
  (10, 'register_city',        'Mieter bei Stadt anmelden',              'Mutationsformular einreichen.', 'Behörden', 1, 'check_in', 'office', false, false, null),
  (11, 'register_utility',     'Stromanbieter melden',                   'Zählerstand + neuer Mieter.', 'Behörden', 1, 'check_in', 'office', false, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'long_term_move_in';

-- LANGZEIT AUSZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('long_term_move_out', 'Langzeit Auszug', 'move_out', 'long_term',
   'Aufgabenliste von Kündigungseingang bis Depot-Rückzahlung und Archivierung.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days, v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  ( 1, 'log_termination',      'Kündigung im ImmoERP eintragen',         'Eingangsdatum + Kündigungsdatum erfassen.', 'Kündigung', -90, 'check_out', 'office', false, false, null),
  ( 2, 'send_termination_confirmation', 'Kündigungsbestätigung senden', 'Schriftliche Bestätigung an Mieter.', 'Kündigung', -89, 'check_out', 'office', false, false, null),
  ( 3, 'list_apartment',       'Wohnung ausschreiben',                   'Inserat auf Flatfox / Homegate / Website.', 'Vermarktung', -60, 'check_out', 'office', false, false, null),
  ( 4, 'schedule_inspection',  'Abnahmetermin vereinbaren',              'Mit Mieter abstimmen.', 'Übergabe', -14, 'check_out', 'office', false, false, null),
  ( 5, 'do_inspection',        'Wohnung abnehmen',                       'Übergabeprotokoll erstellen, Schäden dokumentieren.', 'Übergabe', 0, 'check_out', 'office', false, false, null),
  ( 6, 'repair_damages',       'Schäden reparieren',                     'Falls bei Abnahme Schäden festgestellt.', 'Reparatur', 7, 'check_out', 'office', true, true, 'damage_found'),
  ( 7, 'invoice_damages',      'Schaden-Rechnung stellen',               'Reparaturkosten an Mieter weiterverrechnen.', 'Zahlung', 14, 'check_out', 'office', true, true, 'damage_found'),
  ( 8, 'check_open_invoices',  'Offene Posten prüfen',                   'Letzte Miete, NK, Rechnungen.', 'Zahlung', 21, 'check_out', 'office', false, false, null),
  ( 9, 'release_deposit',      'Depot zurückzahlen',                     'Mietkautionsversicherung auflösen ODER Vergütungsauftrag Bankdepot.', 'Depot', 30, 'check_out', 'office', false, false, null),
  (10, 'archive_files',        'Akten archivieren',                      'Vertrag + Protokolle + Korrespondenz ablegen.', 'Abschluss', 45, 'check_out', 'office', false, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'long_term_move_out';

-- KURZZEIT EINZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('short_term_move_in', 'Kurzzeit Einzug', 'move_in', 'short_term',
   'Vereinfachte Aufgabenliste für 1–3 Monate Kurzzeitmiete.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days, v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  ( 1, 'create_contract',      'Vertrag im ImmoERP erstellen',           'Kurzzeitmietvertrag.', 'Vertrag', -7, 'check_in', 'office', false, false, null),
  ( 2, 'check_flat_rate',      'Kurzzeitpauschale prüfen',               'Pauschale + Mietzins + NK korrekt erfasst.', 'Vertrag', -7, 'check_in', 'office', false, false, null),
  ( 3, 'prepare_deposit_esr',  'Depot-Einzahlungsschein vorbereiten',    'Separates Depotkonto (nicht Flatfox).', 'Zahlung', -7, 'check_in', 'office', false, false, null),
  ( 4, 'send_contract',        'Vertrag zur Unterzeichnung senden',      'PDF an Mieter.', 'Vertrag', -5, 'check_in', 'office', false, false, null),
  ( 5, 'check_payment',        'Eingang Miete + Depot prüfen',           'Vor Übergabe.', 'Zahlung', -2, 'check_in', 'office', false, false, null),
  ( 6, 'schedule_handover',    'Übergabetermin festlegen',               null, 'Übergabe', -3, 'check_in', 'office', false, false, null),
  ( 7, 'do_handover',          'Wohnung übergeben',                      'Schlüsselübergabe + Kurz-Briefing (WLAN, Müll, etc.).', 'Übergabe', 0, 'check_in', 'office', false, false, null),
  ( 8, 'register_city',        'Stadt-Anmeldung prüfen',                 'Bei Aufenthalt > 90 Tage erforderlich.', 'Behörden', 1, 'check_in', 'office', true, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'short_term_move_in';

-- KURZZEIT AUSZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('short_term_move_out', 'Kurzzeit Auszug', 'move_out', 'short_term',
   'Vereinfachte Auszugs-Aufgabenliste für Kurzzeitmieter.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days, v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  ( 1, 'schedule_inspection',  'Abnahmetermin vereinbaren',              null, 'Übergabe', -3, 'check_out', 'office', false, false, null),
  ( 2, 'do_inspection',        'Wohnung abnehmen',                       'Schäden dokumentieren.', 'Übergabe', 0, 'check_out', 'office', false, false, null),
  ( 3, 'repair_damages',       'Schäden reparieren',                     null, 'Reparatur', 5, 'check_out', 'office', true, true, 'damage_found'),
  ( 4, 'invoice_damages',      'Schaden-Rechnung stellen',               null, 'Zahlung', 7, 'check_out', 'office', true, true, 'damage_found'),
  ( 5, 'release_deposit',      'Depot zurückzahlen',                     'Vom separaten Depotkonto.', 'Depot', 14, 'check_out', 'office', false, false, null),
  ( 6, 'archive_files',        'Akten archivieren',                      null, 'Abschluss', 21, 'check_out', 'office', false, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'short_term_move_out';

-- BOOKING EINZUG (Booking.com / Direkt)
insert into workflow_templates (code, name, kind, scope, description) values
  ('booking_move_in', 'Booking Einzug', 'move_in', 'booking',
   'Minimaler Workflow für Booking.com / Airbnb / Direktbuchungen.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days, v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  ( 1, 'assign_apartment',     'Wohnung zuweisen',                       'Falls noch nicht automatisch zugewiesen.', 'Reservation', -3, 'check_in', 'office', false, false, null),
  ( 2, 'send_arrival_info',    'Anreise-Infos senden',                   'WLAN, Schlüsselbox, Adresse.', 'Übergabe', -2, 'check_in', 'office', false, false, null),
  ( 3, 'check_payment',        'Zahlungseingang prüfen',                 'Booking-Auszahlung / Direktzahlung.', 'Zahlung', 1, 'check_in', 'office', false, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'booking_move_in';

-- BOOKING AUSZUG
insert into workflow_templates (code, name, kind, scope, description) values
  ('booking_move_out', 'Booking Auszug', 'move_out', 'booking',
   'Minimaler Auszugs-Workflow für Booking-Gäste.');

insert into workflow_template_tasks
  (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
select t.id, v.p, v.code, v.title, v.description, v.category, v.off_days, v.anchor::task_due_anchor, v.role::task_assignee_role, v.opt, v.cond, v.ckey
from workflow_templates t
cross join (values
  ( 1, 'check_cleaning',       'Reinigung sicherstellen',                'Auftrag wurde automatisch erzeugt.', 'Reinigung', 0, 'check_out', 'office', false, false, null),
  ( 2, 'check_inspection',     'Inspektion / Schäden prüfen',            'Falls nötig Foto-Doku.', 'Übergabe', 0, 'check_out', 'office', false, false, null),
  ( 3, 'check_booking_payout', 'Booking-Auszahlung prüfen',              'Eingang vom Channel kontrollieren.', 'Zahlung', 14, 'check_out', 'office', false, false, null)
) as v(p, code, title, description, category, off_days, anchor, role, opt, cond, ckey)
where t.code = 'booking_move_out';
