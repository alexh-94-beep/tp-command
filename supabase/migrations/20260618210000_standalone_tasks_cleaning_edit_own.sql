-- Phase 15: Mireme darf ihre erstellten Aufgaben bearbeiten.
--
-- Bisherige Policy "standalone_tasks_cleaning_update_own_status" erlaubt
-- nur Updates wenn assignee_id = auth.uid(). Mireme erfasst aber oft
-- Telefon-Aufgaben fuer andere (Brian, unassigned) — danach kann sie
-- sie nicht mehr korrigieren, obwohl sie der Ersteller ist.
--
-- Wir erweitern: cleaning darf updaten, wenn sie entweder Assignee
-- ODER Ersteller (created_by) ist. Idempotent: drop + create.

drop policy if exists standalone_tasks_cleaning_update_own_status on standalone_tasks;

create policy standalone_tasks_cleaning_update_own_or_created
  on standalone_tasks
  for update
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
    and (assignee_id = auth.uid() or created_by = auth.uid())
  )
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
    and (assignee_id = auth.uid() or created_by = auth.uid())
  );
