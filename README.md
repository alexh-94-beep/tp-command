# TP-Command

Internes Betriebssystem für die Vermietung von 180 möblierten Apartments
(ThreePoint, Dübendorf). Löst die SharePoint-Belegungsliste ab und bildet alle
operativen Workflows ab – Einzug, Auszug, Reinigung, Cityus, Booking, Übergaben.

Dies ist der **v2-Neuaufbau**. Geschäftskontext und Datenmodell stehen in
`PROJECT-BRIEF.md`, die Neuaufbau-Entscheidungen in `PROJECT-BRIEF-v2.md`,
die Architektur in `ARCHITECTURE.md`. Der v1-Stand ist als Git-Tag
`v1-archive` erreichbar.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** (CSS-first, Theme via `@theme` in `globals.css`)
- **Supabase** (PostgreSQL + Auth + Storage + RLS)
- **pnpm** als Package-Manager, **Vercel** als Hosting

## Voraussetzungen

- Node.js 20+
- pnpm 9
- Supabase-CLI
- Docker (für das lokale Supabase)

## Lokales Setup

```bash
# 1. Abhängigkeiten installieren
pnpm install

# 2. Lokales Supabase starten (Docker)
supabase start

# 3. Schema + Demo-Daten einspielen
supabase db reset

# 4. DB-Typen generieren
pnpm db:types

# 5. Env-Datei anlegen
cp .env.example .env.local
# .env.local mit den Werten aus `supabase status` füllen
#  (NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY)

# 6. Dev-Server starten
pnpm dev          # http://localhost:3000
```

### Test-User anlegen

`supabase db reset` legt keine Auth-User an. Einen anlegen:

```bash
SK=$(supabase status -o env | grep '^SERVICE_ROLE_KEY=' | cut -d'"' -f2)
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/admin/users' \
  -H "apikey: $SK" -H "Authorization: Bearer $SK" \
  -H 'Content-Type: application/json' \
  -d '{"email":"a.huber@threepoint.ch","password":"<passwort>","email_confirm":true}'
```

Danach das Profil in `public.users` ergänzen (Rolle setzen) – am einfachsten
über `supabase/seed-prod.sql` im Studio-SQL-Editor (`http://127.0.0.1:54323`).

## Scripts

| Befehl                 | Zweck                                          |
|------------------------|------------------------------------------------|
| `pnpm dev`             | Dev-Server                                     |
| `pnpm build`           | Production-Build                               |
| `pnpm typecheck`       | `tsc --noEmit`                                 |
| `pnpm lint`            | ESLint                                         |
| `pnpm format`          | Prettier                                       |
| `pnpm db:start/stop`   | Lokales Supabase                               |
| `pnpm db:reset`        | Schema + Seed neu einspielen                   |
| `pnpm db:types`        | DB-Typen aus lokalem Supabase generieren       |
| `pnpm db:types:remote` | DB-Typen aus dem verlinkten Cloud-Projekt      |

## Projektstruktur

```
src/app/         Pages, Layouts, API-Routes
src/server/      'use server' Actions (Auth-Check + zod-Validierung)
src/services/    pure Business-Logik, testbar
src/lib/         Supabase-Clients, Helpers, Auth
src/components/  reine React-UI
src/types/       generierte DB-Typen (db.ts – nicht von Hand pflegen)
supabase/        Migrationen + Seed
```

Details und Konventionen: `ARCHITECTURE.md`.

## Deployment

Getrennte dev/prod-Umgebungen auf Supabase + Vercel – siehe `DEPLOYMENT.md`.
Datenbank-Reset auf der Cloud: `MIGRATION-RESET.md`.

## Build-Gate

`pnpm typecheck && pnpm lint && pnpm build` muss **ohne unterdrückte Fehler**
grün sein. Kein `ignoreBuildErrors`, kein `ignoreDuringBuilds`. DB-Typen werden
generiert, nicht von Hand gepflegt.
