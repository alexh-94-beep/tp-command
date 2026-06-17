-- Phase 22b: Mail-Typ "booking_modified" — Datumsaenderung einer
-- bestehenden Buchung wurde im Booking.com-Extranet bestaetigt.
--
-- Subject-Pattern: "Booking.com - Eine Buchung wurde geändert!
--   (NR, Wochentag, Datum) (Datumsänderung der Buchung bestätigt)"
--
-- Idempotent: enum-add via DO-Block.

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'processed_email_action' and e.enumlabel = 'booking_modified'
  ) then
    alter type processed_email_action add value 'booking_modified';
  end if;
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'processed_email_action' and e.enumlabel = 'arrivals_summary'
  ) then
    alter type processed_email_action add value 'arrivals_summary';
  end if;
end $$;
