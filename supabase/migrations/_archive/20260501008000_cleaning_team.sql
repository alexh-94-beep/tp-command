-- Bidet → Bide korrigieren
update cleaning_staff
set full_name = 'Bide'
where full_name = 'Bidet';

-- Team-Konzept für Personen, die immer zusammen arbeiten
alter table cleaning_staff
  add column team_name text;

-- Sevdale + Bide als gemeinsames Team markieren
update cleaning_staff
set team_name = 'Sevdale & Bide'
where full_name in ('Sevdale', 'Bide');
