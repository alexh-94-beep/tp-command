# TP-Command

Internes Betriebs­system für unseren Bestand möblierter Apartments.

Ablöse der bisherigen SharePoint-Excel: zentrale Sicht auf Belegung, Buchungen,
Reinigung, Zahlungen – mit automatischer Anbindung an Booking.com und einer
Architektur, die Airbnb, Expedia und Direkt­buchungen später trägt.

## Stack (Kurzfassung)

- Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase (Postgres, Auth, Storage, Edge Functions)
- Resend + react-email für Mails
- Vercel Hosting + Vercel Cron für Hintergrund-Jobs
- Vitest + Playwright

## Module

1. **Dashboard** – Live-Übersicht: Belegung, Ein-/Auszüge, offene Reinigungen, offene Zahlungen.
2. **Wohnungen** – Stammdaten pro Apartment.
3. **Belegungsplanung** – Kalender mit Verfügbarkeits-Check.
4. **Buchungen** – Langzeit, Kurzzeit, Booking in einer Tabelle.
5. **Channels** – Booking.com zuerst, später Airbnb / Expedia / Direkt.
6. **Reinigung** – automatische Auftrags­erzeugung, mobile Sicht für das Team.
7. **Zahlungen** – Ampellogik pro Buchung.
8. **Kommunikation** – Templates für Welcome / Check-in / Erinnerungen.

## Dokumentation

| Datei | Inhalt |
|-------|--------|
| [docs/01-architektur.md](docs/01-architektur.md) | Tech-Stack, Schichten, Channel-Adapter-Pattern |
| [docs/02-datenmodell.md](docs/02-datenmodell.md) | Tabellen, Enums, ER-Diagramm |
| [docs/03-roadmap.md](docs/03-roadmap.md) | Phasen 0–4 für das MVP, Definition of Done |
| [docs/04-annahmen.md](docs/04-annahmen.md) | Alle MVP-Annahmen, dokumentiert für Review |
| [docs/05-projektstruktur.md](docs/05-projektstruktur.md) | Verzeichnisbaum + Konventionen |

## Status

**Phase 0 abgeschlossen** (29.04.2026): Skelett, Auth, Datenbank-Schema, App-Shell.
Nächster Schritt: Phase 1 – CRUD für Wohnungen, Mieter und Buchungen.

## Rollen

`admin`, `office`, `cleaning`, `management` – Definition siehe
[docs/04-annahmen.md](docs/04-annahmen.md), Punkt 17.

## Lokal entwickeln

Voraussetzungen: Node 20+, pnpm, Docker (für lokales Supabase).

```bash
# 1. Dependencies
pnpm install

# 2. Env vorbereiten
cp .env.example .env.local
# (Werte einsetzen, siehe `pnpm supabase status` nach dem Start)

# 3. Supabase lokal starten – Datenbank, Auth, Storage, Studio
pnpm supabase start

# 4. Migrationen + Seed laufen automatisch beim ersten Start.
# Bei Schema-Änderungen:
pnpm db:reset

# 5. Typen für die DB neu generieren (überschreibt src/types/db.ts)
pnpm db:types

# 6. Dev-Server
pnpm dev
```

App: <http://localhost:3000>
Supabase Studio: <http://localhost:54323>
Magic-Link-Mails landen lokal in Inbucket: <http://localhost:54324>

### Ersten Admin anlegen

Nach `pnpm supabase start`:

1. Login auf <http://localhost:3000/login> mit deiner Mail starten.
2. Magic-Link aus Inbucket bestätigen – das legt einen `auth.users`-Eintrag an.
3. In Supabase Studio (<http://localhost:54323>) → Table Editor → `users`
   einen Eintrag mit derselben `id` (UUID kopieren aus auth.users) und
   `role = 'admin'` einfügen.
4. Reload – du siehst das Dashboard.

(Ab Phase 1 gibt es dafür einen Admin-User-Manager unter `/settings/users`.)
