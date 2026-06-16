-- Phase 14b: Workflow-Template für Booking-Pool-Reservationen
--
-- Sitzungs-Backlog: Bei rental_type='booking' sollen andere Workflow-Tasks
-- als bei Langzeit/Kurzzeit greifen:
--   - Self-Check-In Infos senden (mit Wohnungsnummer)
--   - Parkplatz benötigt? Ja/Nein → ggf. Parkplatz-Nr. eintragen
--   - Zahlungslink (SumUp) senden
--   - Bei Parkplatz: Nr. dem Gast mitteilen + Kennzeichen programmieren
--
-- Template-Auswahl in instantiateBookingTasks: scope IN (rental_type, 'all').
-- Mit scope='booking' wird dieses Template automatisch für alle Booking-
-- Pool-Buchungen instantiiert.
--
-- Idempotent: ON CONFLICT auf code skip — Migration kann mehrfach laufen.

insert into workflow_templates (code, name, kind, scope, description, is_active)
values
  ('booking_checkin_v1', 'Booking Check-In', 'move_in', 'booking',
   'Self-Check-In + Parkplatz + Zahlung für Booking.com-Gäste', true)
on conflict (code) do nothing;

-- Tasks für das Template (Position + Defaults)
do $$
declare
  v_template_id uuid;
begin
  select id into v_template_id from workflow_templates where code = 'booking_checkin_v1';
  if v_template_id is null then return; end if;

  -- Existierende Tasks fuer dieses Template löschen, damit Re-Run sauber funktioniert.
  delete from workflow_template_tasks where template_id = v_template_id;

  insert into workflow_template_tasks (
    template_id, position, code, title, description, category,
    due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key
  ) values
    (v_template_id, 10, 'booking_checkin_info',
     'Self-Check-In Infos senden',
     'Mail mit Wohnungs-Nr., Schlüsselbox-Code, Anreise-Hinweisen an Gast schicken.',
     'Kommunikation', -3, 'check_in', 'office', false, false, null),

    (v_template_id, 20, 'booking_parking_check',
     'Parkplatz benötigt? Ja/Nein',
     'Beim Gast nachfragen, ob ein Parkplatz benötigt wird.',
     'Kommunikation', -3, 'check_in', 'office', false, false, null),

    (v_template_id, 30, 'booking_parking_assign',
     'Parkplatz zuteilen + Nr. eintragen',
     'Falls Parkplatz benötigt: freien Stellplatz suchen und Nummer in der Buchung dokumentieren.',
     'Parking', -2, 'check_in', 'office', false, true, 'parking_included'),

    (v_template_id, 40, 'booking_payment_link',
     'Zahlungslink (SumUp) senden',
     'SumUp-Zahlungslink für die Buchungssumme generieren und an Gast schicken.',
     'Zahlung', -3, 'check_in', 'office', false, false, null),

    (v_template_id, 50, 'booking_parking_notify',
     'Parkplatz-Nummer dem Gast mitteilen',
     'Falls Parkplatz zugeteilt: Nummer per Mail an den Gast.',
     'Kommunikation', -1, 'check_in', 'office', false, true, 'parking_included'),

    (v_template_id, 60, 'booking_license_plate',
     'Kennzeichen programmieren',
     'Kennzeichen des Gastes ins Schranken-System eintragen.',
     'Parking', -1, 'check_in', 'office', true, true, 'parking_included'),

    (v_template_id, 70, 'booking_arrival_ready',
     'Wohnung bereit prüfen (Pre-Checkin)',
     'Kurzcheck am Anreisetag: ist die Wohnung wirklich bereit? (Reinigung erledigt, WLAN OK, Wäsche).',
     'Übergabe', 0, 'check_in', 'office', false, false, null);
end $$;
