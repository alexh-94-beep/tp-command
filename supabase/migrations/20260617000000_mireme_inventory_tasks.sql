-- Phase 15: Mireme-Tasks bei Einzug (Inventar/Reinigung/Reparatur).
--
-- Sitzungs-Wunsch: bei Langzeit/Kurzzeit/Booking-Einzug soll Mireme
-- automatisch 3 Vorbereitungs-Tasks bekommen:
--   - Inventar pruefen
--   - Reinigungs-Status pruefen
--   - Reparaturen / Schaeden vor Einzug pruefen
--
-- Anker = check_in. Offsets:
--   long_term/short_term:  -3 / -2 / -3 Tage vor Einzug
--   booking (kurz):        -1 / -1 / -1 Tag  (knapper Vorlauf)
--
-- assignee_role = 'cleaning' → wird beim Instantiate Mireme zugewiesen
-- und erscheint auf ihrem Dashboard ("Meine Aufgaben heute & ueberfaellig"
-- + Kommende Einzuege).
--
-- Idempotent: insert ... on conflict (template_id, code) do nothing.

-- Wir benutzen einen eindeutigen Code je Template, damit der UNIQUE-Index
-- (template_id, code) das Re-Run schuetzt.

do $$
declare
  v_long_id    uuid;
  v_short_id   uuid;
  v_booking_id uuid;
begin
  select id into v_long_id    from workflow_templates where code = 'long_term_move_in';
  select id into v_short_id   from workflow_templates where code = 'short_term_move_in';
  select id into v_booking_id from workflow_templates where code = 'booking_move_in';

  -- LANGZEIT EINZUG
  if v_long_id is not null then
    insert into workflow_template_tasks
      (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
    values
      (v_long_id, 90, 'mireme_check_inventory',
       'Inventar prüfen (vor Einzug)',
       'Wohnung kontrollieren: Möblierung vollständig, sauber, nicht beschädigt? Zustand fotografieren.',
       'Übergabe', -3, 'check_in', 'cleaning', false, false, null),
      (v_long_id, 91, 'mireme_check_cleaning_status',
       'Reinigungsstatus prüfen',
       'Ist die Wohnung sauber für Einzug? Falls nicht: Auffrischung einplanen oder Reinigungsauftrag erfassen.',
       'Reinigung', -2, 'check_in', 'cleaning', false, false, null),
      (v_long_id, 92, 'mireme_check_repairs',
       'Reparaturen prüfen',
       'Defekte/Schäden kontrollieren. Falls nötig: Reparaturauftrag erfassen oder als Schaden dokumentieren.',
       'Reparatur', -3, 'check_in', 'cleaning', false, false, null)
    on conflict (template_id, code) do nothing;
  end if;

  -- KURZZEIT EINZUG
  if v_short_id is not null then
    insert into workflow_template_tasks
      (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
    values
      (v_short_id, 90, 'mireme_check_inventory',
       'Inventar prüfen (vor Einzug)',
       'Wohnung kontrollieren: Möblierung vollständig, sauber, nicht beschädigt? Zustand fotografieren.',
       'Übergabe', -3, 'check_in', 'cleaning', false, false, null),
      (v_short_id, 91, 'mireme_check_cleaning_status',
       'Reinigungsstatus prüfen',
       'Ist die Wohnung sauber für Einzug? Falls nicht: Auffrischung einplanen oder Reinigungsauftrag erfassen.',
       'Reinigung', -2, 'check_in', 'cleaning', false, false, null),
      (v_short_id, 92, 'mireme_check_repairs',
       'Reparaturen prüfen',
       'Defekte/Schäden kontrollieren. Falls nötig: Reparaturauftrag erfassen oder als Schaden dokumentieren.',
       'Reparatur', -3, 'check_in', 'cleaning', false, false, null)
    on conflict (template_id, code) do nothing;
  end if;

  -- BOOKING EINZUG (knapper Vorlauf)
  if v_booking_id is not null then
    insert into workflow_template_tasks
      (template_id, position, code, title, description, category, due_offset_days, due_anchor, assignee_role, is_optional, is_conditional, condition_key)
    values
      (v_booking_id, 90, 'mireme_check_inventory',
       'Inventar prüfen (vor Anreise)',
       'Möblierung + Verbrauchsmaterial (Kaffee/Tee/Toilettenpapier) vollständig?',
       'Übergabe', -1, 'check_in', 'cleaning', false, false, null),
      (v_booking_id, 91, 'mireme_check_cleaning_status',
       'Reinigungsstatus prüfen',
       'Wohnung sauber für Booking-Anreise? Bettwäsche bezogen?',
       'Reinigung', -1, 'check_in', 'cleaning', false, false, null),
      (v_booking_id, 92, 'mireme_check_repairs',
       'Defekte prüfen',
       'Funktioniert alles (WLAN, Geräte, Beleuchtung)?',
       'Reparatur', -1, 'check_in', 'cleaning', false, false, null)
    on conflict (template_id, code) do nothing;
  end if;
end $$;
