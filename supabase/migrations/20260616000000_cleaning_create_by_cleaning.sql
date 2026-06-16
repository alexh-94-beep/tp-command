-- Phase 15: Mireme (cleaning) darf selber Reinigungsauftraege erfassen.
--
-- Bisher gibt es eine Insert-Policy `cleaning_tasks write office` mit
-- `can_write()` — also nur admin+office. Reinigungs-Team wuerde mit RLS
-- abgewiesen, obwohl die Server-Action seit Phase 15 die Rolle 'cleaning'
-- akzeptiert.
--
-- Loesung: zusaetzliche Insert-Policy, die `is_cleaning()` zulaesst und
-- gleichzeitig sicherstellt, dass die neu erfasste Aufgabe entweder
--   - direkt sich selber zugewiesen wird (assigned_to = auth.uid()), oder
--   - noch nicht zugewiesen ist (assigned_to is null) — Office picks spaeter.
-- So bleibt das Sicherheitsmodell konsistent mit der Update-Policy fuer
-- cleaning ("nur eigene oder unassignierte").
--
-- Idempotent dank `if not exists`.

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'cleaning_tasks'
       and policyname = 'cleaning_tasks insert cleaning'
  ) then
    create policy "cleaning_tasks insert cleaning"
      on cleaning_tasks for insert
      with check (
        is_cleaning()
        and (assigned_to = auth.uid() or assigned_to is null)
      );
  end if;
end $$;
