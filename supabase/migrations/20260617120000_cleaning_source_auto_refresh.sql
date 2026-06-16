-- Phase 15: source-Wert 'auto_refresh' zulassen.
--
-- Bei Buchungs-Erfassung legt der Service ensureRefreshCleaningForBooking
-- eine Auffrischungs-Reinigung an, wenn die Wohnung > 7 Tage leer stand.
-- Damit wir das von normalen manuellen Tasks unterscheiden koennen,
-- bekommt der Task source='auto_refresh'.
--
-- Idempotent: drop + add. Existierende Werte gehen NICHT verloren — der
-- bisherige Check umfasst sie weiterhin, der neue ist eine reine
-- Obermenge.

alter table cleaning_tasks
  drop constraint if exists cleaning_tasks_source_check;

alter table cleaning_tasks
  add constraint cleaning_tasks_source_check
    check (source in (
      'manual',
      'auto_checkout',
      'auto_refresh',   -- NEU: Auffrischung weil Wohnung lange leer stand
      'cityus',
      'workflow',
      'external_owner'
    ));
