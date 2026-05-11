-- Alle Enum-Typen. Reihenfolge ist wichtig (Tables referenzieren sie).

create type user_role         as enum ('admin','office','cleaning','management');
create type apartment_type    as enum ('junior','senior','suite','studio');

-- Wohnungs-Status (operativ, abgeleitet/manuell):
--  available       = frei zur Vermietung
--  occupied        = aktuell vermietet
--  terminated      = noch belegt, aber Kündigung ist da
--  contract_pending= Vertrag in Erstellung (vor Einzug)
--  booking_active  = aktive Booking-Belegung
--  maintenance     = wegen Wartung gesperrt
--  blocked         = manuell gesperrt (Eigennutzung etc.)
create type apartment_status  as enum (
  'available','occupied','terminated','contract_pending',
  'booking_active','maintenance','blocked'
);

-- Eigentümer-Verhältnis:
--  own            = Bestand der Firma
--  sold_managed   = verkauft, aber Vermietung läuft weiter über uns
--  sold_external  = verkauft, nicht mehr von uns vermietet (nur Gedankenstütze)
create type apartment_ownership as enum ('own','sold_managed','sold_external');

-- Status der Türschilder / Namensschilder
create type name_tag_status as enum ('pending','ordered','installed');

-- Wartungs-Bestätigung
create type maintenance_visit_status as enum ('planned','confirmed','done','cancelled');
create type maintenance_contact_method as enum ('email','whatsapp','phone','none');

-- Mängel (Defects)
create type defect_severity as enum ('low','normal','high','urgent');
create type defect_status   as enum ('open','in_progress','resolved','wont_fix');

-- Warteliste
create type waitlist_status as enum ('open','contacted','placed','dropped');
create type rental_type       as enum ('long_term','short_term','booking');
create type booking_status    as enum ('planned','active','completed','cancelled');
create type contract_status   as enum ('draft','sent','signed','cancelled');
create type checkinout_status as enum ('pending','completed');
create type payment_type      as enum (
  'rent','deposit','first_rent','booking_payout',
  'short_term_flat','parking','other'
);
create type payment_status    as enum ('pending','paid','overdue','cancelled');
create type payment_method    as enum (
  'bank_transfer','manual_slip','booking_payout','flatfox','card','other'
);
create type cleaning_type     as enum (
  'checkout','pre_checkin','intermediate','special','deep_clean'
);
create type cleaning_priority as enum ('low','normal','high','urgent');
create type cleaning_status   as enum ('open','in_progress','done','quality_checked');
create type communication_type as enum (
  'welcome','payment_info','checkin_info','wifi_info',
  'payment_reminder','checkout_info','internal_cleaning_notification'
);
create type communication_channel as enum ('email','sms','internal');
create type communication_status  as enum ('draft','scheduled','sent','failed','cancelled');
create type tenant_kind       as enum ('tenant','guest');
create type tenant_source     as enum (
  'direct','flatfox','booking_com','airbnb','expedia','website'
);
create type id_doc_type       as enum ('passport','id_card','driver_license');

-- Aggregierter Buchungs-Zahlungsstatus (abgeleitet, aber als Enum für UI).
create type booking_payment_status as enum ('pending','partial','paid','overdue');
