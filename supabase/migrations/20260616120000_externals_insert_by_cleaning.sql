-- Phase 15 Bug-Fix: Mireme (cleaning) darf externe Eigentuemer + Wohnungen
-- inline beim Erfassen eines Reinigungs-Auftrags anlegen.
--
-- Bisher hatte external_owners eine Policy "external_owners_admin_office_all"
-- (for all) die admin/office/management erlaubt, aber nicht cleaning.
-- external_apartments hatte ueber die generische Schleife in der
-- Init-Migration nur "with check (can_write())" → admin+office.
--
-- Symptom in der UI: Mireme oeffnet den Owner-Wizard im Cleaning-Modal,
-- klickt "Anlegen & weiter" → requireRole erzwingt redirect('/dashboard')
-- (so wird die Server-Action effektiv abgebrochen) und das Modal
-- verschwindet. Mireme glaubt, der Auftrag sei gespeichert, ist aber
-- nicht angelegt — der Cleaning-Task wurde NIE erfasst.
--
-- Loesung: zusaetzliche Insert-Policies fuer cleaning auf
-- external_owners und external_apartments. is_cleaning() wird in der
-- Init-Migration definiert.
--
-- Idempotent dank if not exists.

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'external_owners'
       and policyname = 'external_owners_cleaning_insert'
  ) then
    create policy external_owners_cleaning_insert
      on external_owners
      for insert
      with check (is_cleaning());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'external_apartments'
       and policyname = 'external_apartments_cleaning_insert'
  ) then
    create policy external_apartments_cleaning_insert
      on external_apartments
      for insert
      with check (is_cleaning());
  end if;
end $$;
