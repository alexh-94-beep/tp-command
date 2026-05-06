# Projektstruktur

So sieht das Repository aus, sobald wir Phase 0 abschliessen. Die Struktur ist
auf **modularen Monolith** ausgelegt: alle Module in einem Repo, klar getrennt
über Ordnerschnitt und Service-Layer, ohne Microservices.

```
tp-command/
├── README.md
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.js
├── .env.example
├── .env.local                  # nicht committen
├── .eslintrc.json
├── .prettierrc
│
├── docs/                       # diese Dokumente
│   ├── 01-architektur.md
│   ├── 02-datenmodell.md
│   ├── 03-roadmap.md
│   ├── 04-annahmen.md
│   └── 05-projektstruktur.md
│
├── public/                     # statische Assets
│
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx              # geschützter Bereich
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── apartments/
│   │   │   │   ├── page.tsx            # Liste
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx        # Detail
│   │   │   │       └── edit/page.tsx
│   │   │   ├── bookings/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── calendar/page.tsx       # Belegungsplanung
│   │   │   ├── tenants/
│   │   │   ├── cleaning/
│   │   │   │   ├── page.tsx            # Office-Sicht
│   │   │   │   └── mobile/page.tsx     # Reinigungs-Sicht (mobil)
│   │   │   ├── payments/page.tsx
│   │   │   └── settings/
│   │   │       ├── users/page.tsx
│   │   │       └── channels/page.tsx
│   │   ├── api/
│   │   │   ├── webhooks/
│   │   │   │   └── booking/route.ts    # Booking → uns
│   │   │   ├── ical/
│   │   │   │   ├── pull/route.ts       # Cron: iCal von Channels holen
│   │   │   │   └── [apartment]/route.ts # iCal-Feed pro Wohnung exportieren
│   │   │   └── cron/
│   │   │       ├── nightly/route.ts    # Status-Recompute, Reminder
│   │   │       └── cleaning/route.ts   # Aufträge generieren
│   │   ├── layout.tsx                  # Root-Layout
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/                         # shadcn Komponenten
│   │   ├── layout/                     # Sidebar, Topbar, ...
│   │   ├── apartments/
│   │   ├── bookings/
│   │   ├── calendar/
│   │   ├── cleaning/
│   │   ├── dashboard/
│   │   └── shared/
│   │
│   ├── server/                         # Server Actions
│   │   ├── apartments.ts
│   │   ├── bookings.ts
│   │   ├── tenants.ts
│   │   ├── cleaning.ts
│   │   ├── payments.ts
│   │   └── communications.ts
│   │
│   ├── services/                       # Domain-Logik (UI-frei!)
│   │   ├── availability/
│   │   │   ├── check.ts                # check(apartment, range, ignoreId?)
│   │   │   └── findFreeSlots.ts
│   │   ├── allocation/
│   │   │   ├── autoAssign.ts           # Booking → Wohnung
│   │   │   └── scoring.ts
│   │   ├── cleaning/
│   │   │   ├── generate.ts             # erzeugt Aufträge bei Auszug
│   │   │   └── completion.ts
│   │   ├── payments/
│   │   │   ├── recompute.ts
│   │   │   └── reminders.ts
│   │   └── communications/
│   │       ├── render.ts
│   │       └── send.ts
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts               # createServerClient()
│   │   │   ├── browser.ts              # createBrowserClient()
│   │   │   └── service.ts              # service-role, NUR server
│   │   ├── auth/
│   │   │   ├── rbac.ts                 # can(user, action, resource)
│   │   │   └── session.ts
│   │   ├── channels/
│   │   │   ├── types.ts                # ChannelAdapter Interface
│   │   │   ├── booking-com/
│   │   │   │   ├── adapter.ts
│   │   │   │   ├── ical.ts
│   │   │   │   └── webhook.ts
│   │   │   ├── airbnb/                 # Phase 5+
│   │   │   ├── expedia/                # Phase 5+
│   │   │   └── direct/
│   │   ├── email/
│   │   │   ├── client.ts               # Resend
│   │   │   └── templates/              # react-email
│   │   ├── dates.ts                    # Zeitzonen-Helfer
│   │   ├── money.ts
│   │   └── logger.ts
│   │
│   ├── types/
│   │   ├── db.ts                       # generiert von supabase-cli
│   │   ├── domain.ts
│   │   └── channels.ts
│   │
│   └── utils/
│       └── ...                         # kleine reine Funktionen
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260501000000_init.sql
│   │   ├── 20260501000100_enums.sql
│   │   ├── 20260501000200_tables.sql
│   │   ├── 20260501000300_views.sql
│   │   ├── 20260501000400_policies.sql
│   │   └── 20260501000500_triggers.sql
│   ├── seed.sql                        # Demo-Daten
│   └── functions/                      # Edge Functions
│       └── ical-pull/index.ts
│
└── tests/
    ├── unit/
    │   ├── services/
    │   └── lib/
    └── e2e/
        └── flows/
            ├── booking-create.spec.ts
            └── cleaning-flow.spec.ts
```

## Wichtige Konventionen

- **`services/` ist das Herz.** Keine UI-Imports, keine `next/*`-Imports.
  Dort werden Geschäftsregeln getestet (Vitest).
- **`server/` enthält Server Actions.** Sie validieren Input mit Zod, laden
  den User, prüfen Rechte und delegieren an einen Service.
- **`lib/` ist „Plumbing"** – Clients, Helper, Wrapper für Drittparteien.
- **Channels** liegen unter `lib/channels/`, weil sie reine Adapter sind.
  Die Logik „welche Wohnung kriegt welche Buchung" steht in `services/allocation/`,
  nicht im Adapter.
- **Migrations** werden nicht editiert, sondern nur ergänzt. Eine fehlerhafte
  Migration wird per Folge­migration korrigiert.
- **RLS-Policies** liegen als Migration vor, nicht im UI-Code.

## Branch- & Commit-Strategie

- `main` ist deployt. Alles geht über Pull Requests.
- Branchnamen: `feat/apartments-crud`, `fix/cleaning-status`, ...
- Commits in Conventional-Commits-Format (`feat:`, `fix:`, `chore:`...).
