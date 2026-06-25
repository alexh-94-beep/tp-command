-- Phase 26d: Wiederkehrende Reinigungen pro Buchung
--
-- Office/Admin setzt im Buchungs-Edit-Form eine Frequenz; Cron erzeugt
-- die Folge-Auftraege automatisch. Bei long_term mit Auszugsdatum bis
-- zum Auszug, bei open-ended rollierend 3 Monate.
--
-- Reinigungen, die auf Sa/So fallen wuerden, werden beim Erzeugen
-- auf Fr (Sa) bzw. Mo (So) verschoben. Manuelles Drag&Drop kann sie
-- spaeter zurueck aufs Wochenende ziehen.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'cleaning_recurrence_kind'
  ) then
    create type cleaning_recurrence_kind as enum (
      'none', 'weekly', 'biweekly', 'monthly'
    );
  end if;
end $$;

alter table bookings
  add column if not exists cleaning_recurrence cleaning_recurrence_kind not null default 'none';

alter table bookings
  add column if not exists cleaning_recurrence_linen boolean not null default false;

-- Wir markieren auf cleaning_tasks, dass es aus einer Serie kommt — fuer
-- spaeteres Aufraeumen (z.B. wenn Frequenz auf 'none' gesetzt wird,
-- loeschen wir alle zukuenftigen Serien-Auftraege fuer die Buchung).
alter table cleaning_tasks
  add column if not exists is_recurring boolean not null default false;

create index if not exists cleaning_tasks_booking_recurring_idx
  on cleaning_tasks(booking_id)
  where is_recurring;
