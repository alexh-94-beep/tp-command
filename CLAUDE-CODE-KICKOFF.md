# Kickoff-Prompt für Claude Code — TP-Command v2, Phase 0

So benutzt du diese Datei:

1. Lege `PROJECT-BRIEF-v2.md` und diese Datei in den lokalen `tp-command`-Repo-Klon
   (oder halte sie griffbereit).
2. Öffne Claude Code im `tp-command`-Repo-Verzeichnis.
3. Kopiere den Block unter **„Prompt zum Einfügen"** komplett in Claude Code.

Voraussetzungen, bevor du startest:
- Lokaler Klon von `github.com/alexh-94-beep/tp-command` ist vorhanden und auf `main`.
- `pnpm`, `node` (20+) und die Supabase-CLI sind installiert.
- Du hast einen Supabase- und einen Vercel-Account (die Projekte legen wir im Lauf von Phase 0 an).

---

## Prompt zum Einfügen

```
Du übernimmst das Projekt TP-Command — ein internes Betriebssystem für die
Vermietung von 180 möblierten Apartments. Wir bauen es sauber neu auf (v2).

KONTEXT LESEN (zwingend zuerst):
1. PROJECT-BRIEF-v2.md — die Entscheidungen für den Neuaufbau, Stack,
   Umgebungs-Strategie, Port-vs-Wegwerf-Liste.
2. PROJECT-BRIEF.md — Geschäftskontext, Datenmodell, Workflows, Geschäftsregeln
   (gilt inhaltlich unverändert weiter).
3. ARCHITECTURE.md und docs/ — Architektur und Domain-Doku.

Bestätige in 2–3 Sätzen, dass du den Kontext verstanden hast. Dann arbeite
PHASE 0 ab. Stelle Rückfragen nur, wenn etwas wirklich unklar ist — sonst
triff sinnvolle Annahmen und dokumentiere sie.

WICHTIG — der aktuelle Repo-Inhalt ist v1. Bevor du irgendetwas Neues
schreibst, sichere v1:

  git checkout main && git pull
  git tag v1-archive
  git branch v1-archive-branch
  git push origin v1-archive
  git push origin v1-archive-branch

Danach baust du v2 auf main auf — alte Dateien löschen, neue committen,
KEIN force-push. Der v1-Code bleibt über `git checkout v1-archive` als
Referenz zum Portieren erreichbar.

PHASE 0 — DELIVERABLES:

A. Scaffold
   - Next.js 15 (App Router, React 19) + TypeScript + Tailwind CSS 4, mit pnpm.
   - Ordnerstruktur: src/app, src/server, src/services, src/lib,
     src/components, src/types — gemäss ARCHITECTURE.md.
   - next.config: serverExternalPackages (nicht experimental), typedRoutes
     top-level. KEIN ignoreBuildErrors, KEIN ignoreDuringBuilds.
   - ESLint + Prettier, tsconfig strict.
   - Root src/app/page.tsx macht redirect('/dashboard').

B. Datenbank
   - Konsolidierte Init-Migration aus v1 übernehmen
     (supabase/migrations/20260501000000_init.sql aus dem v1-archive-Tag),
     umbenannt mit aktuellem Zeitstempel. Inhaltlich 1:1 — 25 Tabellen,
     ~40 Enums, RLS, Trigger, 3 Views, 2 Storage-Buckets, 6 Workflow-Templates.
   - Prüfen, dass die Auth-Helper (auth_role, is_admin, can_write, is_cleaning)
     security definer + set search_path = public haben.
   - seed.sql / seed-prod.sql übernehmen.

C. Umgebungen (dev/prod getrennt)
   - Gib mir eine präzise Schritt-für-Schritt-Anleitung zum Anlegen von
     ZWEI Supabase-Projekten: tp-command-dev und tp-command-prod
     (Region Frankfurt). Ich (der User) lege die Cloud-Projekte an, du
     lieferst die Anleitung und sagst mir genau, welche Keys du brauchst.
   - Supabase-CLI mit dem dev-Projekt linken, Init-Migration auf dev pushen.
   - DEPLOYMENT.md und MIGRATION-RESET.md NEU schreiben für die
     Zwei-Projekt-Strategie (die v1-Versionen kennen nur ein Projekt).
   - .env.example aktuell halten; .env.local zeigt auf dev.

D. Supabase-Anbindung im Code
   - src/lib/supabase/server.ts mit `await cookies()` (Next 15 ist async).
   - browser.ts und service.ts portieren.
   - DB-Typen GENERIEREN: `supabase gen types typescript` → src/types/db.ts.
     Nicht von Hand pflegen.

E. Auth + Layout
   - Login-Form (E-Mail + Passwort), Middleware für geschützte Routen,
     geschütztes Layout mit Sidebar + Topbar.
   - Vier Rollen: admin, office, cleaning, management (Enum aus der DB).

F. Deploy
   - Anleitung zum Verbinden des Vercel-Projekts mit dem Repo, Env-Vars
     PRO UMGEBUNG: Production → prod-DB, Preview + Development → dev-DB.
   - Vercel-Cron für /api/cron/channels (täglich 06:00 UTC) in vercel.json.

DEFINITION OF DONE für Phase 0:
- `pnpm typecheck && pnpm lint && pnpm build` lokal grün, ohne unterdrückte
  Fehler.
- Login funktioniert gegen die dev-DB.
- Ein Preview-Deploy (gegen dev) und ein Prod-Deploy (gegen prod) laufen.
- Sauberer Conventional Commit auf main.

ARBEITSWEISE:
- Halte dich strikt an die Layer-Trennung aus ARCHITECTURE.md.
- Pure Logik aus v1 portieren (siehe Port-Liste in PROJECT-BRIEF-v2.md
  Sektion 6), nicht neu erfinden.
- Bei Next-15-Breaking-Changes: PROJECT-BRIEF-v2.md Sektion 4 beachten
  (async cookies, async params/searchParams, umbenannte next.config-Optionen,
  Tailwind-4-@theme).
- Commits klein und beschreibend (Conventional Commits).
- Wenn du an einen Punkt kommst, an dem ich (User) etwas tun muss
  (Cloud-Projekt anlegen, Keys, Vercel), halte an und gib mir eine klare,
  nummerierte Anleitung.

Leg los: zuerst Kontext bestätigen, dann v1 archivieren, dann Phase 0.
```

---

## Nach Phase 0

Wenn Phase 0 grün ist, geht es mit Phase 1 (Wohnungen) weiter — der
Phasenplan steht in `PROJECT-BRIEF.md` Sektion 8 und in `PROJECT-BRIEF-v2.md`
Sektion 8. Du kannst Claude Code dann einfach sagen: „Phase 0 ist grün und
deployed, mach mit Phase 1 weiter — Apartments-Liste, Excel-Import,
Detailseite, Channel-Links." Die jeweils portierbaren Dateien stehen in der
Port-Liste.
