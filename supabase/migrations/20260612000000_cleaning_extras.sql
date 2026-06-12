-- Phase 13.2: Cleaning-Erweiterungen fuer Cityus-Import + Reinigerin-UX
--
-- - linen_change: Bettwaesche wechseln (Default false)
-- - time_flexible: zeitlich flexibel (Default true)
-- - time_constraint_note: Hinweis-Text wenn nicht flexibel (z.B.
--   "Eigentümer will zwingend 10:00")
-- - source: woher kommt der Auftrag — neue Default-Werte ohne enum-
--   Migration, weil das in PG aufwendig ist; wir nutzen text + check.
--
-- Default 'manual' damit existierende Zeilen einen Wert haben.

alter table cleaning_tasks
  add column linen_change boolean not null default false,
  add column time_flexible boolean not null default true,
  add column time_constraint_note text,
  add column source text not null default 'manual'
    check (source in (
      'manual',         -- Office hat manuell angelegt
      'auto_checkout',  -- automatisch bei Buchungs-Auszug
      'cityus',         -- aus Cityus-Excel-Import
      'workflow',       -- aus Workflow-Aufgabe
      'external_owner'  -- externer Eigentuemer
    ));

create index cleaning_tasks_source_idx on cleaning_tasks (source);
