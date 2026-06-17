-- Phase 20: Booking-Inbox-Parser — processed_emails fuer Dedup.
--
-- Der Cron pullt periodisch IMAP-Mails und parsed Booking.com-Buchungen.
-- Damit wir dieselbe Mail nicht mehrfach verarbeiten, speichern wir pro
-- Mail die `Message-ID` ab. Bei nachfolgenden Polls werden bereits
-- verarbeitete Mails uebersprungen.
--
-- Wir speichern ausserdem die action ('new_reservation' | 'cancellation' |
-- 'skipped'), damit Admin im UI sehen kann was bisher gelaufen ist.

create type processed_email_action as enum (
  'new_reservation',
  'cancellation',
  'skipped'
);

create table processed_emails (
  id            uuid primary key default gen_random_uuid(),
  message_id    text not null unique,
  imap_uid      bigint,
  subject       text,
  from_address  text,
  action        processed_email_action not null,
  -- Bei action != 'skipped': Bezug zur Pool-Reservation
  reservation_id uuid references pending_reservations(id) on delete set null,
  -- Bei Bedarf: externe Buchungs-Nr von Booking.com
  external_uid  text,
  error         text,
  raw_excerpt   text,
  processed_at  timestamptz not null default now()
);

create index processed_emails_external_uid_idx
  on processed_emails(external_uid)
  where external_uid is not null;
create index processed_emails_action_processed_idx
  on processed_emails(action, processed_at desc);

-- RLS: nur admin liest. Inserts kommen via Service-Role-Cron.
alter table processed_emails enable row level security;

create policy processed_emails_admin_read
  on processed_emails
  for select
  using (
    exists (select 1 from users where id = auth.uid() and role = 'admin')
  );
