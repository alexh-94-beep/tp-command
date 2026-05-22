# TP-Command — Projekt-Brief v2 (Sauberer Neuaufbau)

> Dieser Brief ergänzt den bestehenden `PROJECT-BRIEF.md` aus dem v1-Repo.
> Geschäftskontext, Datenmodell, Akteure, Workflows und Geschäftsregeln gelten
> **unverändert** weiter — sie stehen in `PROJECT-BRIEF.md` (Sektionen 1–11)
> sowie in `ARCHITECTURE.md` und `docs/`.
>
> Was hier neu ist: die Entscheidungen für den Neuaufbau (v2), die
> Umgebungs-Strategie (dev/prod), die Stack-Aktualisierung auf Next.js 15,
> und eine konkrete „aus v1 portieren vs. neu schreiben"-Liste.

---

## 1. Warum überhaupt ein Neuaufbau?

Der erste Versuch (v1) ist **kein gescheitertes Projekt** — alle Module sind
gebaut (~18'000 Zeilen TypeScript), die Layer-Trennung wird grösstenteils
eingehalten, das Datenmodell ist solide. Der Neuaufbau passiert aus zwei
konkreten Gründen:

1. **Saubere Architektur ohne Alt-Lasten.** Frische Repo-Historie, keine
   angesammelten Patches, jede Datei bewusst übernommen statt mitgeschleppt.
2. **Online-first statt nur localhost.** Von Tag 1 an gegen gehostete
   Umgebungen entwickeln, mit getrennten dev/prod-Datenbanken und
   Vercel-Preview-Deployments — nicht erst am Ende deployen.

### Der eigentliche technische Schmerzpunkt aus v1

In `next.config.mjs` steht:

```js
typescript: { ignoreBuildErrors: true },
eslint:     { ignoreDuringBuilds: true },
```

Das heisst: der v1-Build ist **nur grün, weil Typfehler unterdrückt werden**.
Ursache sind un-typisierte PostgREST-Joins (~18 `as unknown as`-Casts) und
eine handgepflegte, unvollständige `src/types/db.ts`. Das ist die Stelle, an
der „sauber" in v2 konkret wird:

> **Harte v2-Regel:** `ignoreBuildErrors` und `ignoreDuringBuilds` sind
> verboten. Der Build muss `pnpm typecheck` **und** `pnpm lint` sauber
> bestehen. DB-Typen werden mit `supabase gen types` generiert, nicht von
> Hand gepflegt.

---

## 2. Entscheidungen für v2 (getroffen mit Alex)

| Thema        | Entscheidung |
|--------------|--------------|
| **Git-Repo** | Bestehendes Repo `tp-command` weiterverwenden. Aktuellen Stand als Tag **`v1-archive`** sichern, dann `main` mit dem sauberen Aufbau **neu beginnen**. |
| **Stack**    | Aktuelle Versionen: **Next.js 15** (App Router) + **Tailwind CSS 4**. |
| **Code aus v1** | Bewährte, framework-unabhängige Elemente werden **portiert** (siehe Sektion 6). Architektur wird sauber neu aufgesetzt. |
| **Umgebungen** | **Getrennte dev/prod** — zwei Supabase-Projekte, Vercel mit Preview-Deployments (siehe Sektion 5). |
| **Reinigungsplanung** | Designprinzip: **jede manuelle Dateneingabe im Reinigungs-Flow ist ein potenzieller Fehler** und wird wo möglich durch Ableitung ersetzt. Reinigungsaufträge werden vom System erzeugt (aus Booking-Check-outs, Cityus-Excel, Auszügen) — niemand legt sie von Hand an. Mireme/Office weist nur zu und passt an. |

---

## 3. Repo-Strategie — v1 archivieren, main neu starten

Bevor irgendetwas Neues entsteht, wird der v1-Stand sicher weggesichert.
Auszuführen von Alex (oder Claude Code mit Git-Auth) im lokalen Klon:

```bash
# Im bestehenden tp-command-Klon, auf main
git checkout main
git pull

# v1-Stand als Tag UND als Branch sichern (doppelt hält besser)
git tag v1-archive
git branch v1-archive-branch
git push origin v1-archive
git push origin v1-archive-branch

# main wird gleich von Claude Code neu bespielt — der erste
# v2-Commit ersetzt den Inhalt. NICHT force-pushen, normaler
# Commit auf main reicht: alte Dateien löschen, neue committen.
```

Der v1-Code bleibt damit dauerhaft über `git checkout v1-archive` erreichbar
und dient als Referenz beim Portieren.

---

## 4. Stack v2 — Next.js 15 + Tailwind 4

### Ziel-Versionen

- **Next.js 15** (App Router, React 19)
- **React 19**
- **Tailwind CSS 4** (neue CSS-first-Konfiguration, kein `tailwind.config.ts`
  mehr nötig — Theme via `@theme` in `globals.css`)
- **TypeScript 5.6+**, **Supabase JS v2** + `@supabase/ssr`
- **pnpm** als Package-Manager, **Vercel** als Hosting
- Beibehalten: `zod`, `date-fns` + `date-fns-tz`, `pdf-lib`, `xlsx` (SheetJS),
  `jszip`, `react-day-picker`, `lucide-react`

### Breaking Changes v1→v2 (beim Portieren beachten)

Diese vier Punkte betreffen fast jede portierte Datei:

1. **`cookies()` ist async.** In Next 15 muss `createSupabaseServerClient()`
   `await cookies()` verwenden. Die v1-Datei `src/lib/supabase/server.ts`
   macht das synchron — beim Port anpassen.
2. **`params` und `searchParams` sind Promises.** Jede `page.tsx` mit
   `[id]`-Segment und jede Page, die `searchParams` liest, muss diese
   `await`en. Page-Komponenten werden konsequent `async`.
3. **`next.config` umbenannte Optionen.** `experimental.serverComponentsExternalPackages`
   → top-level **`serverExternalPackages`**. `experimental.typedRoutes`
   → top-level **`typedRoutes`**.
4. **Tailwind 4.** Kein PostCSS-`tailwind.config.ts` mehr — Theme-Tokens
   (Farben, Spacing) wandern als `@theme`-Block in `globals.css`. Der
   `@tailwind`-Direktiven-Dreisatz wird durch ein einzelnes `@import "tailwindcss";`
   ersetzt.

---

## 5. Umgebungs-Strategie — dev/prod getrennt

Das war der Hauptgrund für den Neustart: **nicht mehr nur localhost.**

### Zwei Supabase-Projekte

| Projekt              | Zweck | Daten |
|----------------------|-------|-------|
| `tp-command-dev`     | Entwicklung, Migrations-Tests, Preview-Deployments | Demo-/Testdaten (`seed.sql`) |
| `tp-command-prod`    | Produktivbetrieb | echte Wohnungen, Mieter, Buchungen |

Beide Region **Frankfurt (eu-central-1)**. Die `prod`-DB wird **nie** direkt
bearbeitet — Schema-Änderungen laufen immer über Migrationen, die zuerst auf
`dev` getestet wurden.

### Vercel — drei Umgebungen, sauber gemappt

| Vercel-Umgebung | Branch         | Supabase | URL |
|-----------------|----------------|----------|-----|
| Production      | `main`         | `tp-command-prod` | `tp-command.vercel.app` |
| Preview         | jeder Feature-Branch | `tp-command-dev` | automatische Preview-URL pro Branch/PR |
| Development     | lokal (`pnpm dev`) | `tp-command-dev` | `localhost:3000` |

Env-Vars werden in Vercel **pro Umgebung** gesetzt: die `NEXT_PUBLIC_SUPABASE_*`-
und `SUPABASE_SERVICE_ROLE_KEY`-Werte zeigen für **Production** auf die
prod-DB, für **Preview + Development** auf die dev-DB. So kann nie ein
Feature-Branch versehentlich Produktivdaten anfassen.

### Migrations-Flow (so wandert Schema von dev nach prod)

```bash
# 1. Neue Migration lokal erzeugen
supabase migration new <beschreibung>

# 2. Gegen dev testen
supabase link --project-ref <DEV_REF>
supabase db push          # wendet auf dev an

# 3. Wenn auf dev/Preview alles grün ist: auf prod anwenden
supabase link --project-ref <PROD_REF>
supabase db push          # wendet auf prod an
```

Die genaue Schritt-für-Schritt-Anleitung (Projekte anlegen, Keys, Storage,
Auth-URLs) gehört in eine überarbeitete `DEPLOYMENT.md` — Claude Code
schreibt sie in Phase 0 neu, weil die v1-Version nur **ein** Projekt kennt.

### Was Alex selbst tun muss (Account-Ebene)

Claude Code kann Code schreiben, aber **nicht** Cloud-Konten bedienen.
Diese Schritte macht Alex (Claude Code liefert die genaue Anleitung):

- Zwei Supabase-Projekte anlegen, Keys notieren
- Vercel-Projekt mit dem GitHub-Repo verbinden, Env-Vars pro Umgebung setzen
- Auth-User für das Team in **beiden** Supabase-Projekten anlegen
- Storage-Buckets entstehen über die Migration — kein manueller Schritt

---

## 6. Port-vs-Wegwerf-Liste (konkret)

Basierend auf der Sichtung des v1-Codes. Pfade beziehen sich auf das
v1-Repo (`git checkout v1-archive`).

### PORTIEREN — 1:1 oder mit minimaler Anpassung (framework-unabhängig, sauber)

| v1-Pfad | Bemerkung |
|---------|-----------|
| `supabase/migrations/20260501000000_init.sql` | **Das Kronjuwel.** Komplettes Datenmodell: 25 Tabellen, ~40 Enums, RLS, Trigger, 3 Views, 2 Storage-Buckets, 6 Workflow-Templates. Wird `20260521000000_init.sql` in v2. Inhaltlich 1:1 übernehmen. |
| `supabase/seed.sql` / `seed-prod.sql` | Demo-Daten + Channels/User-Mapping. Übernehmen, ggf. dev/prod splitten. |
| `src/services/import/cityus.ts` | Cityus-Excel-Parser. Sauber, pure, gut kommentiert. 1:1. |
| `src/lib/channels/flatfox/client.ts` | Flatfox-API-Adapter. Sauber. 1:1. |
| `src/lib/channels/booking/ical.ts` | iCal-Parser. Übernehmen. |
| `src/services/cleaning/duration.ts` | Reinigungs-Dauer-Lookup (Speed-Faktoren). Übernehmen. |
| `src/services/cleaning/generate.ts` | Auto-Generierung Reinigungsaufträge. Übernehmen. |
| `src/services/workflow/instantiate.ts` | Workflow-Instantiierung. Übernehmen — dabei das N+1-Update in `recomputeBookingTaskDueDates` zu einem Batch-Update zusammenfassen. |
| `src/services/channels/auto-assign.ts` | Booking-Wohnungs-Scoring. Übernehmen. |
| `src/services/availability/*` | Verfügbarkeits-/Slot-Logik. Übernehmen. |
| `src/lib/dates.ts`, `money.ts`, `labels.ts`, `cn.ts`, `logger.ts` | Helpers. Übernehmen. |
| `src/app/api/cleaning/daily-pdf/route.ts` | Tagesplan-PDF (pdf-lib). Logik übernehmen, als Next-15-Route-Handler. |
| `src/app/api/cleaning/damage-report-pdf/route.ts` | Schadensreport-PDF. Logik übernehmen. |
| `PROJECT-BRIEF.md`, `ARCHITECTURE.md`, `docs/01`–`05` | Geschäfts-, Architektur- & Domain-Doku. In v2 übernehmen (zusammen mit `PROJECT-BRIEF-v2.md` und `CLAUDE-CODE-KICKOFF.md`), auf Next 15 / Tailwind 4 aktualisieren. |
| `scripts/data/apartments-import.json` | Wohnungs-Stammdaten für Import. Übernehmen. |

### PORTIEREN MIT ANPASSUNG (Next-15-Breaking-Changes)

| v1-Pfad | Anpassung |
|---------|-----------|
| `src/lib/supabase/server.ts` | `await cookies()` (Next 15 async). |
| `src/lib/supabase/browser.ts`, `service.ts` | Prüfen, meist unverändert. |
| `next.config.mjs` | Umbenannte Optionen (Sektion 4). **`ignoreBuildErrors` ersatzlos streichen.** |
| Alle `[id]/page.tsx`, Pages mit `searchParams` | `params`/`searchParams` `await`en, Komponenten `async`. |
| `src/middleware.ts` | Gegen Next-15-Middleware-API prüfen. |
| `tailwind.config.ts` + `globals.css` | Auf Tailwind-4-`@theme` umstellen. |
| UI-Komponenten (`src/components/ui/*`, Module-Komponenten) | Funktional übernehmen, beim Port auf saubere Typisierung achten. |
| Server-Actions (`src/server/**`) | Übernehmen, dabei das `{ ok, error? }`-Return-Muster beibehalten. |

### NEU SCHREIBEN / NICHT NUR KOPIEREN

| Betroffen | Warum |
|-----------|-------|
| `src/types/db.ts` | **Generieren** mit `supabase gen types typescript`, nicht von Hand. Grundlage dafür, dass die `as unknown as`-Casts verschwinden. |
| PostgREST-Join-Stellen (~18 Casts) | Mit den generierten Typen sauber typisieren statt casten. |
| `DEPLOYMENT.md`, `MIGRATION-RESET.md` | Neu schreiben für die dev/prod-Zwei-Projekt-Strategie (v1 kennt nur eins). |
| `next.config.mjs` Build-Gate | Ohne `ignore*`-Flags — Build muss echt grün sein. |

### WEGWERFEN (nicht übernehmen)

| v1-Pfad | Warum |
|---------|-------|
| `supabase/migrations/_archive/` | 17 alte Einzel-Migrationen, durch `init.sql` abgelöst. |
| `supabase/snippets/Untitled query *.sql` | Scratch-Dateien aus dem Supabase-Editor. |
| `tsconfig.tsbuildinfo` | Build-Artefakt, gehört in `.gitignore`. |
| `pnpm-lock.yaml` (v1) | Wird durch frische Installation der Next-15-Deps neu erzeugt. |

---

## 7. Architektur-Prinzipien (gelten unverändert + ein Zusatz)

Die Layer-Trennung aus `ARCHITECTURE.md` bleibt 1:1 gültig:

```
src/app/        Pages, Layouts, API-Routes → ruft server/ oder services/
src/server/     'use server' Actions (Auth-Check + zod-Validierung)
src/services/   pure Business-Logik, testbar, kein 'use server', kein React
src/lib/        Supabase-Client, Helpers
src/components/ reine React-UI, kein DB-Wissen
```

Ebenso unverändert: konsolidierte Init-Migration, Auth-Helper mit
`security definer` + `set search_path = public`, Storage-Buckets via Migration,
Tests früh (Vitest für Services, Playwright für kritische Journeys).

**Zusatz-Prinzip für v2 (aus dem v1-Schmerzpunkt):**

> Der CI-/Build-Gate ist heilig. `pnpm typecheck && pnpm lint && pnpm build`
> muss **ohne unterdrückte Fehler** grün sein. Lieber eine Stunde Typen
> sauber ziehen als ein `ignoreBuildErrors`. Sobald DB-Typen generiert sind,
> gibt es keine Ausrede mehr für `as any` / `as unknown as` ohne Begründung.

---

## 8. Phasenplan

Der Phasenplan aus `PROJECT-BRIEF.md` Sektion 8 (Phase 0–11) gilt
unverändert — **mit einer erweiterten Phase 0**:

### Phase 0 — Setup (erweitert für v2)

- Next.js 15 + React 19 + Tailwind 4 + TypeScript scaffolden (pnpm)
- `next.config`, `tsconfig`, ESLint/Prettier — **ohne** Build-Error-Unterdrückung
- Ordnerstruktur `app / server / services / lib / components / types` anlegen
- Zwei Supabase-Projekte anlegen (Anleitung für Alex), CLI mit `dev` linken
- Konsolidierte Init-Migration aus v1 übernehmen (`20260521000000_init.sql`)
- Auth-Helper mit `security definer` (sind in der Migration enthalten — prüfen)
- DB-Typen generieren → `src/types/db.ts`
- Supabase-Clients (`server` mit `await cookies()`, `browser`, `service`)
- Login-Form (E-Mail + Passwort), Middleware, geschütztes Layout (Sidebar/Topbar)
- Root-`page.tsx` → `redirect('/dashboard')`
- `DEPLOYMENT.md` + `MIGRATION-RESET.md` für dev/prod neu schreiben
- Vercel-Projekt verbinden, Env-Vars pro Umgebung, erstes Preview- + Prod-Deploy

**Phase 0 ist fertig, wenn:** `pnpm typecheck && pnpm lint && pnpm build`
lokal grün sind, ein Preview-Deploy gegen `dev` und ein Prod-Deploy gegen
`prod` läuft, und der Login funktioniert.

Phasen 1–11 (Wohnungen, Buchungen, Flatfox, Workflow-Engine, Reinigung,
Booking.com, Cityus, Übergaben, Dashboard, E-Mail, Zahlungen) folgen wie
in `PROJECT-BRIEF.md` Sektion 8 beschrieben. Pro Phase werden die in
Sektion 6 als „portieren" markierten Dateien übernommen.

### Definition of Done — pro Phase

Jede Phase gilt erst als abgeschlossen, wenn:

1. `pnpm typecheck && pnpm lint && pnpm build` grün (keine unterdrückten Fehler),
2. neue Services Vitest-Tests haben,
3. die Phase auf einer Preview-URL (gegen `dev`) lauffähig ist,
4. ein Conventional Commit auf einem `feat/<phase>`-Branch liegt,
5. nach Merge auf `main` der Prod-Deploy grün ist.

---

## 9. Erste konkrete Aufgabe

Der fertige Kickoff-Prompt für Claude Code steht in der Datei
**`CLAUDE-CODE-KICKOFF.md`**. Er deckt Phase 0 ab und ist so geschrieben,
dass er direkt in Claude Code eingefügt werden kann.

---

## Anhang — Anti-Patterns (v1-Liste + v2-Ergänzung)

Unverändert aus `PROJECT-BRIEF.md` Sektion 10. Neu hinzugekommen:

- ❌ `ignoreBuildErrors` / `ignoreDuringBuilds` in `next.config` — der Build
  muss echt grün sein.
- ❌ Handgepflegte `db.ts` — DB-Typen werden generiert.
- ❌ Feature-Branch arbeitet gegen die prod-DB — Preview zeigt immer auf `dev`.
- ❌ Schema-Änderung direkt im prod-Supabase-Dashboard — immer über Migration,
  zuerst auf `dev` getestet.
