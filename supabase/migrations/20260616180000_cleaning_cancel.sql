-- Phase 15: Reinigungs-Auftraege koennen storniert werden (mit Begruendung).
--
-- Sitzungs-Wunsch: Mireme erfasst einen Auftrag, der spaeter nicht mehr
-- noetig ist (Mieter sagt ab, externer Eigentuemer abmeldet, Buchung
-- storniert, Doppel-Erfassung). Sie soll ihn nicht loeschen, sondern
-- mit Begruendung stornieren — fuer Audit + spaetere Nachvollziehbarkeit.
--
-- Datenmodell:
--   - cleaning_status um 'cancelled' erweitert
--   - cancellation_reason  text       (Pflicht beim Stornieren — UI-seitig)
--   - cancelled_at         timestamptz
--   - cancelled_by         uuid references users(id)
--
-- Listen/Dashboards filtern stornierte Tasks aus den "offen"-Buckets.
-- Range='all' zeigt sie weiterhin an, mit Badge-Anzeige in der UI.
--
-- Idempotent: enum-add via DO-Block mit not-exists check, ALTER TABLE
-- mit IF NOT EXISTS.

do $$
begin
  if not exists (
    select 1
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'cleaning_status'
       and e.enumlabel = 'cancelled'
  ) then
    alter type cleaning_status add value 'cancelled';
  end if;
end $$;

alter table cleaning_tasks
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancelled_by        uuid references users(id) on delete set null;

create index if not exists cleaning_tasks_cancelled_idx
  on cleaning_tasks(cancelled_at);
