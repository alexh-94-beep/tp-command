-- Phase 25b: Langzeitmieten — Workflow-Erweiterungen
--
-- Move-in:  zusaetzlich "Schluessel bereitmachen" (Mireme, am Anreisetag)
-- Move-out: zusaetzlich "Abnahmereinigung planen" (Mireme, +1 Tag nach
--           Abnahme). Wird der Task auf done gesetzt, legt der Service-
--           Code automatisch einen cleaning_task vom Typ 'deep_clean' an.
--
-- Idempotent: Inserts nur wenn der Task-Code im Template noch fehlt.

-- 1) long_term_move_in: keys_prepared
insert into workflow_template_tasks (
  template_id, position, code, title, description, category,
  due_offset_days, due_anchor, assignee_role, is_optional, is_conditional
)
select
  w.id, 93, 'long_term_keys_prepared',
  'Schlüssel bereitmachen',
  'Schluessel fuer den neuen Mieter bereitlegen (Schluesselsafe / Empfang).',
  'cleaning',
  0, 'check_in', 'cleaning', false, false
from workflow_templates w
where w.code = 'long_term_move_in'
  and not exists (
    select 1 from workflow_template_tasks t
     where t.template_id = w.id and t.code = 'long_term_keys_prepared'
  );

-- 2) long_term_move_out: schedule_handover_deep_cleaning
insert into workflow_template_tasks (
  template_id, position, code, title, description, category,
  due_offset_days, due_anchor, assignee_role, is_optional, is_conditional
)
select
  w.id, 11, 'schedule_handover_deep_cleaning',
  'Gründliche Abnahmereinigung planen',
  'Abnahmereinigung nach Inspektion einplanen. Beim Abhaken wird automatisch eine Reinigung vom Typ ''Gründlich'' fuer den Tag nach der Inspektion angelegt.',
  'cleaning',
  1, 'check_out', 'cleaning', false, false
from workflow_templates w
where w.code = 'long_term_move_out'
  and not exists (
    select 1 from workflow_template_tasks t
     where t.template_id = w.id and t.code = 'schedule_handover_deep_cleaning'
  );
