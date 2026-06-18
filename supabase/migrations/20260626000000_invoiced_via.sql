-- Phase 25a: Flag fuer Kurzzeit-Buchungen, ob sie ueber W&W oder direkt
-- (Offerte, ohne Vertrag) abgerechnet werden.
--
-- Bei rental_type='short_term':
--   'w_w'    → Mietzins/Depot werden via W&W gefuehrt, hier nur Referenz
--   'direct' → Wir rechnen selbst ab, Mietzins/Depot sind Pflichtfelder
--
-- Bei rental_type='long_term': default 'w_w' (alle Langzeit-Vertraege
--   laufen ueber W&W). Bei 'booking': Feld irrelevant.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'invoiced_via'
  ) then
    create type invoiced_via as enum ('w_w', 'direct');
  end if;
end $$;

alter table bookings
  add column if not exists invoiced_via invoiced_via not null default 'w_w';
