-- Phase 27c (Teil 2): Workflow-Template + Tasks fuer Tagesbuchung.
--
-- Workaround fuer Postgres-Enum-Constraint: neues enum-value
-- 'day_stay' aus vorheriger Migration steht nicht in derselben Transaction
-- zur Verfuegung. Wir verwenden EXECUTE damit es erst zur Laufzeit
-- aufgeloest wird.
--
-- Idempotent: ON CONFLICT DO NOTHING.

do $$
declare
  tpl_id uuid;
  sharon_id uuid;
begin
  execute $sql$
    insert into workflow_templates (code, name, kind, scope, is_active)
    values ('day_stay_move_in', 'Tagesbuchung — Check-in', 'move_in', 'day_stay', true)
    on conflict (code) do nothing
  $sql$;

  select id into tpl_id from workflow_templates where code = 'day_stay_move_in';
  if tpl_id is null then return; end if;

  select id into sharon_id from users
   where full_name ilike '%Sharon%' and is_active limit 1;

  insert into workflow_template_tasks (
    template_id, position, code, title, description, category,
    due_offset_days, due_anchor, assignee_role, is_optional, is_conditional
  ) values
  (tpl_id, 10, 'day_stay_checkin_info',
   'Check-in Anleitung versendet',
   'Anleitung mit Schluessel-Abholung und Wohnungs-Infos verschicken.',
   'cleaning', -1, 'check_in', 'cleaning', false, false),
  (tpl_id, 20, 'day_stay_parking_check',
   'Parkplatz benötigt?',
   'Gast fragen ob Parkplatz benoetigt wird.',
   'cleaning', -1, 'check_in', 'cleaning', false, false),
  (tpl_id, 30, 'day_stay_parking_assign',
   'Parkplatz zuteilen',
   'Freien Parkplatz aus dem Booking-Pool zuteilen.',
   'cleaning', 0, 'check_in', 'cleaning', false, true),
  (tpl_id, 40, 'day_stay_keys_prepared',
   'Schluessel bereitlegen',
   'Schluessel im Safe / am Empfang bereitlegen.',
   'cleaning', 0, 'check_in', 'cleaning', false, false),
  (tpl_id, 50, 'day_stay_arrival_ready',
   'Anreise bereit?',
   'Wohnung gereinigt und bereit fuer Check-in.',
   'cleaning', 0, 'check_in', 'cleaning', false, false)
  on conflict do nothing;

  insert into workflow_template_tasks (
    template_id, position, code, title, description, category,
    due_offset_days, due_anchor, assignee_role, assignee_user_id,
    is_optional, is_conditional
  ) values
  (tpl_id, 60, 'day_stay_invoice_create',
   'Rechnung erstellen',
   'Rechnung an den Gast erstellen und versenden (Tagesbuchung wird direkt abgerechnet).',
   'office', 0, 'check_in', 'office', sharon_id,
   false, false)
  on conflict do nothing;

  update workflow_template_tasks
     set condition_key = 'parking_included'
   where template_id = tpl_id
     and code = 'day_stay_parking_assign';
end $$;
