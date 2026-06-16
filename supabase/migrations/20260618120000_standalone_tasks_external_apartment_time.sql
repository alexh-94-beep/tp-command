-- Phase 15: Standalone-Aufgaben um externe Wohnung + Faelligkeits-Uhrzeit
-- erweitern.
--
-- Sitzungs-Wunsch:
--   - Wenn die Aufgabe einen externen Eigentuemer betrifft, soll Mireme
--     die Wohnungs-Nr als Freitext eintragen koennen (z.B. "E.2201") —
--     ohne dass ein eigener external_apartments-Eintrag noetig ist.
--   - Unter Faellig soll auch eine Uhrzeit moeglich sein (z.B.
--     Liftreservation 10:00).
--
-- Neue Felder:
--   apartment_label  text  — Freitext, wenn keine interne Wohnung gewaehlt
--   due_time         time  — optionale Uhrzeit zusaetzlich zum due_date
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

alter table standalone_tasks
  add column if not exists apartment_label text,
  add column if not exists due_time        time;
