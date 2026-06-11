-- Standalone-Aufgaben (Phase 10): freie Aufgaben ohne Buchungs-Bezug,
-- z.B. "Schloss reparieren in C.0202" oder Office-Todo.
--
-- Separate Tabelle (nicht booking_tasks erweitern), damit Workflow-
-- Felder (kind, position, template_task_id) sauber NUR fuer Buchungs-
-- Tasks gelten und die Listen-UI klar trennen kann.

create type standalone_task_category as enum (
  'repair',     -- Reparatur (Schloss, Licht, Bad)
  'office',     -- Office-Todo (Anruf, Mail, Termin)
  'inspection', -- Inspektion / Begehung
  'other'
);

create type standalone_task_status as enum (
  'open',
  'in_progress',
  'done',
  'cancelled'
);

create type standalone_task_priority as enum (
  'low',
  'normal',
  'high',
  'urgent'
);

create table standalone_tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  category      standalone_task_category not null default 'other',
  priority      standalone_task_priority not null default 'normal',
  status        standalone_task_status not null default 'open',
  apartment_id  uuid references apartments(id) on delete set null,
  assignee_id   uuid references users(id) on delete set null,
  due_date      date,
  created_by    uuid references users(id) on delete set null,
  done_at       timestamptz,
  done_by       uuid references users(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index standalone_tasks_status_idx on standalone_tasks (status, due_date);
create index standalone_tasks_apartment_idx on standalone_tasks (apartment_id);
create index standalone_tasks_assignee_idx on standalone_tasks (assignee_id);

-- updated_at-Trigger nachziehen (gleicher Helper wie an anderen Stellen)
create or replace function trg_standalone_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger standalone_tasks_set_updated_at
before update on standalone_tasks
for each row execute function trg_standalone_tasks_updated_at();

-- RLS: admin + office volle Rechte; cleaning sieht nur, was ihm zugewiesen
-- ist (assignee_id = auth.uid()).
alter table standalone_tasks enable row level security;

create policy standalone_tasks_admin_office_all
  on standalone_tasks
  for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'office', 'management')
    )
  )
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'office', 'management')
    )
  );

create policy standalone_tasks_cleaning_read_own
  on standalone_tasks
  for select
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
    and assignee_id = auth.uid()
  );

create policy standalone_tasks_cleaning_update_own_status
  on standalone_tasks
  for update
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
    and assignee_id = auth.uid()
  )
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role = 'cleaning'
    )
    and assignee_id = auth.uid()
  );
