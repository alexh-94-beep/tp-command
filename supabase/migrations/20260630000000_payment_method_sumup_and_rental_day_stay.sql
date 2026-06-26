-- Phase 27b + 27c (Welle C2 + C3):
--
-- 1) payment_method.sumup — eigener Wert fuer Zahlungen die ueber das
--    SumUp-Terminal eingegangen sind. Aktuell manuell erfasst; spaeter
--    moeglich, die SumUp-API anzubinden und Zahlungen automatisch zu
--    importieren (deshalb eigener Wert statt 'other' + Notiz).
--
-- 2) rental_type.day_stay — Tagesbuchung (manuell von Office erfasst).
--    Aehnliche Mechanik wie Booking-Buchungen, aber wir stellen die
--    Rechnung selbst aus (automatischer Workflow-Task an Sharon).
--
-- 3) workflow_template_tasks.assignee_user_id — optionale Direkt-Zuweisung
--    eines konkreten Users. Ueberschreibt assignee_role wenn gesetzt.
--    Erlaubt es z.B. den 'Rechnung erstellen'-Task der Tagesbuchung
--    explizit an Sharon zu binden statt 'irgendeinen office-User'.
--
-- Idempotent: DO-Blocks fuer enums, IF NOT EXISTS fuer Column.

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'payment_method' and e.enumlabel = 'sumup'
  ) then
    alter type payment_method add value 'sumup';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'rental_type' and e.enumlabel = 'day_stay'
  ) then
    alter type rental_type add value 'day_stay';
  end if;
end $$;

alter table workflow_template_tasks
  add column if not exists assignee_user_id uuid references users(id) on delete set null;
