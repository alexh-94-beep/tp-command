-- ============================================================
-- Pool-Modus für Booking.com & Co.:
--   Reservationen kommen ohne Wohnungs-Bezug rein und müssen erst
--   einer freien Wohnung zugewiesen werden.
-- ============================================================

create type pending_reservation_status as enum ('pending', 'assigned', 'cancelled');

create table pending_reservations (
  id                   uuid primary key default gen_random_uuid(),
  channel_id           uuid not null references channels(id) on delete cascade,
  external_uid         text not null,
  start_date           date not null,
  end_date             date not null,
  summary              text,
  description          text,
  guest_count          int,                              -- später, wenn Channel das liefert
  status               pending_reservation_status not null default 'pending',
  assigned_booking_id  uuid references bookings(id) on delete set null,
  assigned_by          uuid references users(id),
  assigned_at          timestamptz,
  raw_payload          jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (channel_id, external_uid),
  constraint pending_reservations_dates_chk check (end_date > start_date)
);
create index pending_reservations_status_idx on pending_reservations(status);
create index pending_reservations_dates_idx  on pending_reservations(start_date, end_date);

create trigger pending_reservations_set_updated_at before update on pending_reservations
  for each row execute function set_updated_at();

-- RLS
alter table pending_reservations enable row level security;
create policy "pending_reservations read auth"
  on pending_reservations for select using (auth.uid() is not null);
create policy "pending_reservations write office"
  on pending_reservations for insert with check (can_write());
create policy "pending_reservations update office"
  on pending_reservations for update using (can_write()) with check (can_write());
create policy "pending_reservations delete admin"
  on pending_reservations for delete using (is_admin());
