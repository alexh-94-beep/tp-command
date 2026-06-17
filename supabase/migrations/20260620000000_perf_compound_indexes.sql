-- Phase 19 (Performance-Pass): Compound-Indexe fuer haeufige Filter.
--
-- Quelle: gemessene Hot-Path-Queries
--   - Dashboard: bookings WHERE start_date=today
--   - Dashboard: bookings WHERE end_date=today + neq=OPEN_END_DATE
--   - /cleaning: cleaning_tasks WHERE status IN (open,in_progress) + scheduled_date<>today
--   - Mireme-Dashboard: standalone_tasks WHERE assignee_id=me OR created_by=me
--   - /tasks: booking_tasks WHERE status + due_date Range
--   - Audit-Log: audit_log WHERE created_at BETWEEN ... ORDER BY created_at DESC
--
-- Idempotent via IF NOT EXISTS.

-- bookings: Datum-Lookup pro Tag (Dashboard "heute Einzug/Auszug")
create index if not exists bookings_start_date_idx on bookings(start_date)
  where status in ('planned', 'active');
create index if not exists bookings_end_date_idx on bookings(end_date)
  where status in ('planned', 'active');

-- cleaning_tasks: status + scheduled_date (Dashboard heute/Woche/ueberfaellig)
create index if not exists cleaning_tasks_status_date_idx
  on cleaning_tasks(status, scheduled_date)
  where status in ('open', 'in_progress');

-- cleaning_tasks: pro staff_id + Datum (Daily-Board)
create index if not exists cleaning_tasks_staff_date_idx
  on cleaning_tasks(staff_id, scheduled_date)
  where staff_id is not null;

-- standalone_tasks: created_by fuer Mireme-Dashboard
-- (assignee + due_date Index existiert; created_by hat nur einen FK-Index nicht)
create index if not exists standalone_tasks_created_by_idx
  on standalone_tasks(created_by, status)
  where status in ('open', 'in_progress');

-- audit_log: Datum-Range Filter + Sort (Settings-Audit-Page)
create index if not exists audit_log_created_at_idx
  on audit_log(created_at desc);

-- booking_tasks: assignee_id + status + due_date (Cleaning-Dashboard Mireme)
create index if not exists booking_tasks_assignee_due_idx
  on booking_tasks(assigned_to, status, due_date)
  where status in ('open', 'in_progress')
    and assigned_to is not null;

-- apartments: status fuer Belegungs-Zaehler im Dashboard
-- (apartments_status_idx existiert bereits, OK)

-- debitor_invoices: created_at desc Sort (List-Page)
-- (debitor_invoices_status_idx mit created_at desc existiert bereits, OK)
