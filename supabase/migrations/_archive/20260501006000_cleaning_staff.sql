-- ============================================================
-- Operative Reinigungs-Personen ohne App-Zugriff
-- (Nicole, Bidet, Sevdale etc.). Mireme als App-User mit role='office'
-- weist die Aufgaben zu und macht QC.
-- ============================================================

create table cleaning_staff (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text,
  phone       text,
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index cleaning_staff_active_idx on cleaning_staff(is_active) where is_active;

create trigger cleaning_staff_set_updated_at before update on cleaning_staff
  for each row execute function set_updated_at();

-- cleaning_tasks: Zuweisung an Staff (zusätzlich zu assigned_to für User-Tracking)
alter table cleaning_tasks
  add column staff_id uuid references cleaning_staff(id) on delete set null;
create index cleaning_tasks_staff_idx on cleaning_tasks(staff_id);

-- RLS
alter table cleaning_staff enable row level security;
create policy "cleaning_staff read auth"
  on cleaning_staff for select using (auth.uid() is not null);
create policy "cleaning_staff write office"
  on cleaning_staff for insert with check (can_write());
create policy "cleaning_staff update office"
  on cleaning_staff for update using (can_write()) with check (can_write());
create policy "cleaning_staff delete admin"
  on cleaning_staff for delete using (is_admin());

-- Demo-Daten (deaktivieren wenn nicht erwünscht)
insert into cleaning_staff (full_name) values
  ('Nicole'),
  ('Bidet'),
  ('Sevdale')
on conflict do nothing;
