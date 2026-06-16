-- Phase 15: Mireme als Lead-Reinigung — voller Zugriff auf cleaning_tasks.
--
-- Bisher waren cleaning-User auf ihre eigenen oder unzugewiesene Tasks
-- begrenzt. Mireme ist aber Lead Reinigungsteam: sie plant Tagesplan +
-- Wochenplan, weist Reinigerinnen zu, lädt Cityus-Excel hoch, druckt
-- Schadensrapport. Dafür braucht sie Lese- und Schreibrecht auf ALLE
-- cleaning_tasks, nicht nur ihre eigenen.
--
-- Wir entfernen die bisherigen restriktiven cleaning-Policies und legen
-- breitere wieder an. Insert-Policy bleibt unverändert (created by
-- cleaning ist okay).
--
-- Idempotent.

-- Alte restriktive Policies entfernen
drop policy if exists "cleaning_tasks read cleaning"   on cleaning_tasks;
drop policy if exists "cleaning_tasks update cleaning" on cleaning_tasks;

-- Breite Lese-Policy: cleaning sieht alle Tasks (Lead)
create policy "cleaning_tasks read cleaning"
  on cleaning_tasks for select
  using (is_cleaning());

-- Breite Update-Policy: cleaning darf alle Tasks updaten (Zuteilung,
-- Status, Notizen, Storno etc.). Sicherheit: cleaning-Rolle bekommt nur
-- Mireme — wir haben kein "cleaning-staff-self-service"-Konto.
create policy "cleaning_tasks update cleaning"
  on cleaning_tasks for update
  using (is_cleaning())
  with check (is_cleaning());
