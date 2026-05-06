-- ============================================================
-- Row Level Security: Policies pro Rolle.
-- Rollen werden in public.users.role gespeichert. JWT-Claim
-- enthält user.id, daraus lesen wir die Rolle per Helfer-Funktion.
-- ============================================================

create or replace function auth_role()
returns user_role language sql stable as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function is_admin()
returns boolean language sql stable as $$
  select coalesce(auth_role() = 'admin', false)
$$;

create or replace function can_write()
returns boolean language sql stable as $$
  select coalesce(auth_role() in ('admin','office'), false)
$$;

create or replace function is_cleaning()
returns boolean language sql stable as $$
  select coalesce(auth_role() = 'cleaning', false)
$$;

-- ============================================================
-- RLS aktivieren
-- ============================================================
alter table users                    enable row level security;
alter table channels                 enable row level security;
alter table apartments               enable row level security;
alter table apartment_channel_links  enable row level security;
alter table tenants                  enable row level security;
alter table bookings                 enable row level security;
alter table blocks                   enable row level security;
alter table payments                 enable row level security;
alter table cleaning_tasks           enable row level security;
alter table cleaning_photos          enable row level security;
alter table communications           enable row level security;
alter table audit_log                enable row level security;
alter table maintenance_visits       enable row level security;
alter table defects                  enable row level security;
alter table waitlist                 enable row level security;

-- ============================================================
-- users: jeder sieht sich selbst, Admin sieht alle.
-- ============================================================
create policy "users self read"   on users for select using (id = auth.uid() or is_admin());
create policy "users admin write" on users for all    using (is_admin()) with check (is_admin());

-- ============================================================
-- channels, apartments, tenants, bookings, blocks, payments, communications:
-- Lesen alle authentifizierten User. Schreiben nur admin/office.
-- ============================================================
do $$
declare
  t text;
  table_list text[] := array[
    'channels', 'apartments', 'apartment_channel_links',
    'tenants', 'bookings', 'blocks', 'payments', 'communications',
    'maintenance_visits', 'defects', 'waitlist'
  ];
begin
  foreach t in array table_list loop
    -- %I quotet sowohl den Policy-Namen als auch den Tabellen-Namen als Identifier.
    execute format(
      'create policy %I on %I for select using (auth.uid() is not null)',
      t || ' read auth', t);
    execute format(
      'create policy %I on %I for insert with check (can_write())',
      t || ' write office', t);
    execute format(
      'create policy %I on %I for update using (can_write()) with check (can_write())',
      t || ' update office', t);
    execute format(
      'create policy %I on %I for delete using (is_admin())',
      t || ' delete admin', t);
  end loop;
end $$;

-- ============================================================
-- cleaning_tasks: Reinigungsteam darf nur eigene/offene sehen
-- und nur Status/Notizen aktualisieren.
-- ============================================================
create policy "cleaning_tasks read office"
  on cleaning_tasks for select
  using (can_write() or auth_role() = 'management');

create policy "cleaning_tasks read cleaning"
  on cleaning_tasks for select
  using (
    is_cleaning() and (assigned_to = auth.uid() or assigned_to is null)
  );

create policy "cleaning_tasks write office"
  on cleaning_tasks for insert with check (can_write());

create policy "cleaning_tasks update office"
  on cleaning_tasks for update using (can_write()) with check (can_write());

create policy "cleaning_tasks update cleaning"
  on cleaning_tasks for update
  using (is_cleaning() and (assigned_to = auth.uid() or assigned_to is null))
  with check (is_cleaning());

create policy "cleaning_tasks delete admin"
  on cleaning_tasks for delete using (is_admin());

-- ============================================================
-- cleaning_photos: gleiche Logik wie cleaning_tasks
-- ============================================================
create policy "cleaning_photos read office"
  on cleaning_photos for select using (can_write() or auth_role() = 'management');

create policy "cleaning_photos read cleaning"
  on cleaning_photos for select
  using (
    is_cleaning() and exists (
      select 1 from cleaning_tasks ct
       where ct.id = cleaning_photos.cleaning_task_id
         and (ct.assigned_to = auth.uid() or ct.assigned_to is null)
    )
  );

create policy "cleaning_photos insert"
  on cleaning_photos for insert with check (
    can_write() or (
      is_cleaning() and exists (
        select 1 from cleaning_tasks ct
         where ct.id = cleaning_task_id
           and (ct.assigned_to = auth.uid() or ct.assigned_to is null)
      )
    )
  );

create policy "cleaning_photos delete admin"
  on cleaning_photos for delete using (is_admin());

-- ============================================================
-- audit_log: nur Admin
-- ============================================================
create policy "audit_log admin read" on audit_log for select using (is_admin());
create policy "audit_log insert any" on audit_log for insert with check (auth.uid() is not null);

-- ============================================================
-- Storage policies für cleaning-photos Bucket
-- ============================================================
create policy "cleaning-photos read auth"
  on storage.objects for select
  using (bucket_id = 'cleaning-photos' and auth.uid() is not null);

create policy "cleaning-photos write office or cleaning"
  on storage.objects for insert
  with check (
    bucket_id = 'cleaning-photos' and (can_write() or is_cleaning())
  );

create policy "cleaning-photos delete admin"
  on storage.objects for delete
  using (bucket_id = 'cleaning-photos' and is_admin());
