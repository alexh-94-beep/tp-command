-- Seed-Daten für lokale Entwicklung. Ein paar realistische Wohnungen aus Gebäude C,
-- damit das Dashboard nicht leer ist. Echte Daten kommen über CSV-Import in Phase 1.

insert into channels (code, display_name, is_active) values
  ('direct',     'Direkt',         true),
  ('flatfox',    'Flatfox',        true),
  ('immotop',    'Immotop',        true),
  ('booking_com','Booking.com',    true),
  ('airbnb',     'Airbnb',         false),
  ('expedia',    'Expedia',        false),
  ('website',    'Eigene Website', false);

-- 6 Demo-Wohnungen aus Etage 02 von Gebäude C (Junior + Senior gemischt,
-- inklusive einer verkauften und einer in Wartung)
insert into apartments (
  number, building, type, size_sqm, floor, orientation,
  status, ownership, allowed_rental_types, standard_rent,
  short_term_flat_rate, has_parking, parking_fee, booking_priority,
  furnishing_completion, name_tag_status, notes
) values
  ('C.0201','C','senior',70.0,2,'Nord/Ost', 'occupied','own',
   '{long_term,short_term,booking}', 3086.00, 3500.00, false, null, 5,
   1.000,'installed','Demo-Wohnung'),
  ('C.0202','C','senior',70.0,2,'Süd/Ost',  'available','sold_managed',
   '{long_term,short_term}',          3131.00, 3550.00, false, null, 0,
   1.000,'installed','Verkauft, Vermietung läuft weiter über uns'),
  ('C.0203','C','junior',50.0,2,'Süd',      'occupied','own',
   '{long_term,short_term}',          2499.00, 2900.00, false, null, 0,
   0.888,'installed',null),
  ('C.0204','C','senior',70.0,2,'Süd/West', 'contract_pending','own',
   '{long_term}',                     3109.00, null,    false, null, 0,
   1.000,'ordered','Vertrag in Erstellung'),
  ('C.0205','C','senior',70.0,2,'Nord/West','available','own',
   '{long_term,short_term,booking}', 3086.00, 3500.00, true, 150.00, 10,
   1.000,'installed',null),
  ('C.0206','C','junior',50.0,2,'Nord',     'maintenance','own',
   '{long_term,short_term,booking}', 2459.00, 2850.00, false, null, 0,
   1.000,'installed','Aktuell in Wartung');

insert into tenants (tenant_kind, first_name, last_name, email, phone, source) values
  ('tenant', 'Anna',   'Müller', 'anna.mueller@example.com', '+41 79 111 22 33', 'flatfox'),
  ('tenant', 'Marco',  'Weber',  'marco.weber@example.com',  '+41 78 222 33 44', 'direct'),
  ('guest',  'Sophie', 'Lefèvre','sophie@example.com',       null,               'booking_com');

-- Eine laufende Langzeit-Buchung für C.0201
insert into bookings (
  apartment_id, tenant_id, rental_type, channel_id,
  start_date, end_date, rent_amount, deposit_amount,
  contract_status, status, check_in_status
)
select a.id, t.id, 'long_term', c.id,
       current_date - interval '60 days',
       current_date + interval '120 days',
       3086.00, 6172.00,
       'signed', 'active', 'completed'
  from apartments a, tenants t, channels c
 where a.number = 'C.0201'
   and t.email  = 'anna.mueller@example.com'
   and c.code   = 'flatfox';

-- Geplante Buchung für C.0203 mit Anna ist schon weg, deshalb Marco
insert into bookings (
  apartment_id, tenant_id, rental_type, channel_id,
  start_date, end_date, rent_amount, deposit_amount,
  contract_status, status
)
select a.id, t.id, 'long_term', c.id,
       current_date - interval '300 days',
       current_date + interval '60 days',
       2499.00, 4998.00,
       'signed', 'active'
  from apartments a, tenants t, channels c
 where a.number = 'C.0203'
   and t.email  = 'marco.weber@example.com'
   and c.code   = 'direct';

-- Eine Booking-Reservierung für C.0205 (5 Tage in der Zukunft)
insert into bookings (
  apartment_id, tenant_id, rental_type, channel_id, external_reference,
  start_date, end_date, rent_amount, deposit_amount,
  contract_status, status
)
select a.id, t.id, 'booking', c.id, 'BKG-1234567',
       current_date + interval '5 days',
       current_date + interval '8 days',
       620.00, 0.00,
       'signed', 'planned'
  from apartments a, tenants t, channels c
 where a.number = 'C.0205'
   and t.email  = 'sophie@example.com'
   and c.code   = 'booking_com';

-- Ein paar Demo-Mängel
insert into defects (apartment_id, category, title, severity, status)
select id, 'Möblierung', 'Schranktüre richten Waschmaschine', 'low', 'open'
  from apartments where number = 'C.0202';

insert into defects (apartment_id, category, title, severity, status)
select id, 'Sanitär', 'Dusche hat Kalkflecken', 'low', 'in_progress'
  from apartments where number = 'C.0204';

-- Wartungstermine
insert into maintenance_visits (apartment_id, scheduled_date, scheduled_time, topic, contact_method, status)
select id, current_date + interval '7 days', '10:00', 'Heizungs-Check', 'whatsapp', 'planned'
  from apartments where number = 'C.0201';

insert into maintenance_visits (apartment_id, scheduled_date, scheduled_time, topic, contact_method, status, responsible)
select id, current_date + interval '3 days', '14:00', 'Schranktür reparieren', 'email', 'confirmed', 'Brian'
  from apartments where number = 'C.0202';

-- Warteliste
insert into waitlist (first_name, last_name, email, phone, desired_type, desired_move_in, status)
values
  ('Luca', 'Zampierin', 'luca.zampierin@hotmail.com', '+41 78 228 76 08',
   'junior', current_date + interval '30 days', 'open');
