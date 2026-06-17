-- Phase 21: Gast-Nachrichten als eigener Mail-Typ.
--
-- Booking schickt zusaetzlich zu Bestaetigungen / Stornos auch Mails
-- mit "Wir haben diese Nachricht von <Gast> erhalten". Der Absender
-- ist `<...@guest.booking.com>` und enthaelt den Gast-Namen im
-- Display-Part. Das ist die zuverlaessigste Quelle fuer den Gast-
-- Namen — bei der Standard-Bestaetigung steht er gar nicht drin.
--
-- Idempotent: enum-add via DO-Block.

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
     where t.typname = 'processed_email_action' and e.enumlabel = 'guest_message'
  ) then
    alter type processed_email_action add value 'guest_message';
  end if;
end $$;
