-- Phase 23a: Booking-Workflow-Tasks an Mireme uebertragen + neuer
-- "Schluessel bereitgelegt"-Task + Deadline-Anpassungen.
--
-- Hintergrund: Booking.com-Buchungen werden ausschliesslich von Mireme
-- (cleaning) abgewickelt: Schluessel, Anleitungen, Parkplatz. Office
-- bleibt zustaendig fuer Payment-Link (Buchhaltung).
--
-- Idempotent: UPDATE mit WHERE; INSERT mit ON CONFLICT DO NOTHING.

-- 1) booking_checkin_v1: alle Tasks AUSSER booking_payment_link → cleaning
update workflow_template_tasks t
   set assignee_role = 'cleaning'
  from workflow_templates w
 where t.template_id = w.id
   and w.code = 'booking_checkin_v1'
   and t.code <> 'booking_payment_link';

-- 2) booking_checkin_info: Deadline ein Tag vor Check-in (statt drei)
update workflow_template_tasks t
   set due_offset_days = -1
  from workflow_templates w
 where t.template_id = w.id
   and w.code = 'booking_checkin_v1'
   and t.code = 'booking_checkin_info';

-- 3) NEU: "Schluessel bereitgelegt?"-Task, Position 65 (vor arrival_ready)
insert into workflow_template_tasks (
  template_id, position, code, title, description, category,
  due_offset_days, due_anchor, assignee_role, is_optional, is_conditional
)
select
  w.id, 65, 'booking_keys_prepared',
  'Schlüssel bereitgelegt?',
  'Schluessel fuer den Gast am Anreisetag bereitlegen (Schluesselsafe / Empfang).',
  'office',
  0, 'check_in', 'cleaning', false, false
from workflow_templates w
where w.code = 'booking_checkin_v1'
  and not exists (
    select 1 from workflow_template_tasks t
     where t.template_id = w.id and t.code = 'booking_keys_prepared'
  );

-- 4) booking_move_out: alle Tasks → cleaning
update workflow_template_tasks t
   set assignee_role = 'cleaning'
  from workflow_templates w
 where t.template_id = w.id
   and w.code = 'booking_move_out';
