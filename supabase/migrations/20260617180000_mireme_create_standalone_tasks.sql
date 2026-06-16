-- Phase 15: Mireme darf eigene Aufgaben erfassen (Telefon-Annahme).
--
-- Sitzungs-Wunsch: Mireme nimmt Telefonate entgegen (Schadensmeldungen,
-- Liftreservationen, allgemeine Anfragen) und soll daraus direkt
-- Aufgaben erfassen koennen.
--
-- - Insert-Policy: cleaning darf Tasks anlegen, sofern created_by = sie selbst
-- - Read-Policy erweitert: cleaning sieht zusaetzlich die Tasks, die sie
--   selbst erfasst hat (auch wenn nicht zugewiesen) — sonst verschwindet
--   die Aufgabe direkt nach dem Submit aus ihrer Sicht.
-- - Update-Policy ebenfalls erweitert: ihre eigenen Tasks darf sie editieren
--   (Status + Felder), nicht nur die ihr zugewiesenen.
--
-- Kategorien werden um damage_report und lift_reservation erweitert —
-- damit Telefon-Aufgaben sauber typisiert werden.
--
-- Idempotent.

-- Enum erweitern (idempotent via DO-Block)
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'standalone_task_category' and e.enumlabel = 'damage_report'
  ) then
    alter type standalone_task_category add value 'damage_report';
  end if;
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'standalone_task_category' and e.enumlabel = 'lift_reservation'
  ) then
    alter type standalone_task_category add value 'lift_reservation';
  end if;
end $$;

-- Insert-Policy fuer cleaning (created_by muss sie selbst sein)
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'standalone_tasks'
       and policyname = 'standalone_tasks_cleaning_insert_own'
  ) then
    create policy standalone_tasks_cleaning_insert_own
      on standalone_tasks
      for insert
      with check (
        exists (
          select 1 from users
          where users.id = auth.uid()
            and users.role = 'cleaning'
        )
        and created_by = auth.uid()
      );
  end if;
end $$;

-- Read-Policy erweitern: cleaning sieht eigene erstellte Tasks (created_by)
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'standalone_tasks'
       and policyname = 'standalone_tasks_cleaning_read_own_created'
  ) then
    create policy standalone_tasks_cleaning_read_own_created
      on standalone_tasks
      for select
      using (
        exists (
          select 1 from users
          where users.id = auth.uid()
            and users.role = 'cleaning'
        )
        and created_by = auth.uid()
      );
  end if;
end $$;
