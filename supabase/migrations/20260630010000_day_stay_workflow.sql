-- Phase 27c (Teil 1): workflow_scope.day_stay enum-value.
--
-- Muss in separater Migration vor der Daten-Migration laufen, weil
-- Postgres das neue enum-value erst nach Commit zur Verwendung freigibt.

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'workflow_scope' and e.enumlabel = 'day_stay'
  ) then
    alter type workflow_scope add value 'day_stay';
  end if;
end $$;
