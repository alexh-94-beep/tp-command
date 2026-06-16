-- Phase 17 (Security-Härtung): Audit-Log darf nicht mit fremden Actor-IDs
-- beschrieben werden.
--
-- Vorher: "audit_log insert any" erlaubte jedem authentifizierten User
--   einen Eintrag mit beliebiger actor_id zu schreiben. Damit hätte
--   z.B. Mireme einen Audit-Eintrag im Namen von Brian erzeugen können
--   (Forging).
--
-- Neu: actor_id muss NULL sein (System-Eintrag durch service role) oder
--   exakt dem aufrufenden auth.uid() entsprechen. Lese-Policy bleibt
--   Admin-only.
--
-- Idempotent: drop + create.

drop policy if exists "audit_log insert any" on audit_log;

create policy "audit_log insert self"
  on audit_log
  for insert
  with check (
    auth.uid() is not null
    and (actor_id is null or actor_id = auth.uid())
  );
