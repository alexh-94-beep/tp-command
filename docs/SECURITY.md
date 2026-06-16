# Security Audit — Phase 17

Stand: 2026-06-19

## Threat-Model in einer Zeile

3-User-Team (Alex/admin, Brian+Sharon/office, Mireme/cleaning) plus optionale
management-User. Datenhoheit liegt bei Supabase (RLS + auth). App ist
intern, kein anonymer Zugriff.

## Checks & Ergebnisse

### ✅ Auth-Coverage Server-Actions
Alle 20 Server-Action-Files haben `requireRole(...)` oder `requireUser()`
am Eingang. Pattern systematisch eingehalten — kein action ohne Auth-Check.

### ✅ Layout-Guard
`src/app/(app)/layout.tsx` ruft `requireUser()` — alle App-Pages sind
hinter Auth. `/login` und `/auth/*` sind die einzigen public Routes.

### ✅ RLS auf allen Domain-Tabellen
Init-Migration enabled RLS für alle Domain-Tabellen via DO-Loop.
Spätere Migrationen erweitern Policies (Mireme-Lead-Rolle, externe
Eigentümer, Audit-Log strict actor).

### ✅ Cron-Endpoints geschützt
Vier Routen unter `/api/cron/*` verifizieren `Bearer <CRON_SECRET>`.
Seit Phase 17 timing-safe via `isAuthorizedCron` (Node `crypto.timingSafeEqual`)
statt naivem `!==` String-Compare.

### ✅ PDF-Routen geschützt
`/api/cleaning/daily-pdf` + `/api/cleaning/damage-report-pdf` rufen
`requireRole(['admin','office','cleaning'])`.

### ✅ Service-Role-Key nur server-side
`SUPABASE_SERVICE_ROLE_KEY` ausschließlich in:
- 3 Cron-Routen (`/api/cron/*`)
- `src/lib/supabase/service.ts` (Helper)

Nie in Client Components, nie in `NEXT_PUBLIC_*`.

### ✅ Keine hard-coded Secrets im Code
`rg api_[a-z0-9]{20,}|sk_[a-z0-9]{20,}|password.*=` über `src/` findet
nichts. `.env.local` ist NICHT in git — nur `.env.example` mit leeren
Platzhaltern.

### ✅ Keine `dangerouslySetInnerHTML` / `eval()`
Komplett clean.

### ✅ Audit-Log Forging-Schutz (Phase 17 Fix)
**Vorher:** RLS `audit_log insert any` erlaubte jedem authenticated User
Einträge mit beliebiger `actor_id`. Mireme hätte einen "Brian hat
storniert"-Eintrag schreiben können.

**Jetzt:** Policy `audit_log insert self` verlangt
`actor_id IS NULL OR actor_id = auth.uid()`. Service-Role (Crons) darf
`NULL` schreiben, normale User nur sich selbst.

Migration: `20260619000000_audit_log_strict_actor.sql`

## Restrisiken (akzeptiert)

### Audit-Log: keine UPDATE/DELETE-Restriktion explizit
Nur SELECT (admin) und INSERT (self) sind definiert. Es gibt keine
UPDATE/DELETE-Policies → diese sind in Postgres standardmäßig DENY für
alle nicht-superuser. Damit kann ein User auch eigene Audit-Einträge
nicht im Nachhinein editieren. ✓

### Service-Role-Client in `/api/cron/*`
Bypasst RLS — by design. Mitigation: durch `isAuthorizedCron` geschützt;
Service-Key nur in Vercel-Env, nie im Code. Falls Cron-Secret leakt,
sollte er rotiert werden (`vercel env rm CRON_SECRET ... add ...`).

### Flatfox-Token in Vercel-Env (Production + Development)
Preview-Env aktuell ohne Token, weil Vercel CLI eine konkrete Branch
verlangt. Niedrige Prio — Preview wird selten manuell getestet.

## Test-Suite

- **248 Vitest-Tests** in 18 Files
- Coverage: 47% Statements (Pure-Helpers sind voll abgedeckt; DB-Service-
  Wrapper bewusst nicht — die testet RLS am Live-System)
- Neu in Phase 17: `isAuthorizedCron` (7 Cases), `computeDiff`/`isInterestingDiff` (Phase 16, 10 Cases)

## Verfahren bei Verdacht

1. Vorfall in `audit_log` suchen (Admin → `/settings/audit`)
2. Falls Service-Role-Leak: `CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY`
   rotieren (Supabase-Dashboard + Vercel-Env)
3. Falls User-Konto kompromittiert: in Supabase Auth-Dashboard Session
   widerrufen, Passwort-Reset auslösen
