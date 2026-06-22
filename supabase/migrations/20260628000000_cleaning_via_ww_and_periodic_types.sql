-- Phase 26a: Zwei kleine Welle-A-Erweiterungen
--
-- 1) bookings.cleaning_via_ww — Office markiert ob die Reinigungen einer
--    Buchung ueber W&W abgerechnet werden. Sharon braucht das fuer ihre
--    monatliche Auswertung pro Mieter/Kunde.
--
-- 2) cleaning_type enum erweitern: biweekly_clean, biweekly_clean_linen,
--    monthly_clean, monthly_clean_linen. Pendant zu weekly_clean.

alter table bookings
  add column if not exists cleaning_via_ww boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'cleaning_type' and e.enumlabel = 'biweekly_clean'
  ) then
    alter type cleaning_type add value 'biweekly_clean';
  end if;
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'cleaning_type' and e.enumlabel = 'biweekly_clean_linen'
  ) then
    alter type cleaning_type add value 'biweekly_clean_linen';
  end if;
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'cleaning_type' and e.enumlabel = 'monthly_clean'
  ) then
    alter type cleaning_type add value 'monthly_clean';
  end if;
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'cleaning_type' and e.enumlabel = 'monthly_clean_linen'
  ) then
    alter type cleaning_type add value 'monthly_clean_linen';
  end if;
end $$;
