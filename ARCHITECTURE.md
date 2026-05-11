# TP-Command — Architektur-Leitfaden

Dieses Dokument beschreibt **wo welcher Code hingehört** und welche
Konventionen wir einhalten, damit das Projekt nicht in Spaghetti-Code
abdriftet. Jeder neue Code-Beitrag (manuell oder via AI) sollte sich
an diesen Regeln orientieren.

---

## Layer-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│  src/app/         Next.js App-Router – Pages, Layouts, API  │
│                   ↓ ruft auf                                │
│  src/server/      Server-Actions ('use server') – Mutations │
│                   ↓ ruft auf                                │
│  src/services/    Business-Logik – pure Funktionen, testbar │
│                   ↓ ruft auf                                │
│  src/lib/         Infrastruktur (Supabase-Client, Helpers)  │
│                   ↓ liest                                   │
│  Supabase         Datenbank, Auth, Storage                  │
└─────────────────────────────────────────────────────────────┘
```

Daten fliessen **nach unten** – ein Layer ruft nur den nächsten
darunter, nie umgekehrt.

### Was darf wo?

| Layer        | Darf …                                       | Darf NICHT …                                  |
|--------------|----------------------------------------------|-----------------------------------------------|
| `src/app/`   | UI rendern, Server-Actions oder Services aufrufen | direkt Supabase-Queries machen           |
| `src/server/`| Server-Actions, Auth-Check, Validation       | UI-Code, React-Komponenten                    |
| `src/services/` | Business-Logik, Berechnungen              | `'use server'`, React, `revalidatePath`       |
| `src/lib/`   | Supabase-Client erstellen, Helpers           | Domain-Logik (Reinigung, Buchung, …)          |
| `src/components/` | reine React-UI-Komponenten             | Datenbank-Wissen, Server-Actions importieren  |

---

## Modul-Konvention

Pro Domain (Buchungen, Reinigung, Wohnungen, Workflow, Channels …)
gibt es **drei** parallele Ordner:

```
src/app/(app)/<domain>/         ← Pages + Layouts der Domain
src/server/<domain>/             ← Server-Actions
src/services/<domain>/           ← Pure Business-Logik
```

Beispiel **Reinigung**:

```
src/app/(app)/cleaning/
  page.tsx                    ← Liste
  [id]/page.tsx               ← Detail
  daily/page.tsx              ← Tagesplan
  weekly/page.tsx             ← Wochenplan
  cleaning-toolbar.tsx        ← Client-Komponente

src/server/cleaning/
  actions.ts                  ← markHandoverDone, planHandover, …
  staff.ts                    ← assignTaskToStaff, moveCleaningTask
  cityus-import.ts            ← Excel-Import als Action

src/services/cleaning/
  generate.ts                 ← Auto-Generierung von Tasks
  duration.ts                 ← Speed-Faktor-Berechnung
```

### Wann ein neues Modul?

Wenn ein Bereich
- ≥ 2 Pages hat **oder**
- ≥ 3 Server-Actions hat **oder**
- ein eigenständiges Datenmodell besitzt (eigene Tabellen).

---

## Naming-Konventionen

### Dateien & Ordner

- **kebab-case** für Verzeichnisse und Files (`cleaning-toolbar.tsx`).
- **PascalCase** für React-Komponenten-Exports (`CleaningToolbar`).
- **camelCase** für Funktionen, Variablen, Hooks.
- **SCREAMING_SNAKE_CASE** für Konstanten.

### Server-Actions

- Verb in Imperativ: `createBooking`, `markHandoverDone`, `assignTask`.
- Geben **immer** `{ ok: boolean; error?: string; …Daten }` zurück.
- Schema-Validation mit `zod` direkt in der Action.

### Services (Pure-Funktionen)

- Beschreibendes Verb-Substantiv: `instantiateBookingTasks`,
  `recomputeBookingPaymentStatus`, `estimateDurationMinutes`.
- Nehmen `supabase: SupabaseClient` als Parameter, **erstellen ihn
  nicht selbst**. So sind sie testbar.

### Datenbank

- **snake_case** für Tabellen + Spalten (`booking_tasks`,
  `move_in_planned_at`).
- Plural für Tabellen (`apartments`, nicht `apartment`).
- FK heisst `<tabelle_singular>_id` (`apartment_id`, `tenant_id`).
- Enums werden im SQL als `<domain>_<feld>` benannt
  (`booking_task_status`, `cleaning_status`).

### Migrationen

- **EINE init.sql** für das Initial-Schema (siehe
  `supabase/migrations/20260501000000_init.sql`).
- Neue Migrationen heissen `YYYYMMDDHHMMSS_<beschreibung>.sql`
  (Supabase-CLI generiert das via `supabase migration new <name>`).
- Pro Migration **eine fokussierte Änderung**: z. B. „Stadt-Meldung
  zu workflow_template_tasks ergänzen", nicht „diverse Cleanups".
- Niemals direkt in der Cloud-DB ändern – immer via Migration.

---

## Server-Actions vs. Services

### Server-Action (`src/server/<domain>/actions.ts`)

- Hat `'use server'` ganz oben.
- Macht Auth-Check (`requireRole`).
- Macht Input-Validation (`zod`).
- Ruft Service oder direkt Supabase auf.
- Macht `revalidatePath` am Ende.
- Wird aus React-Komponenten via `<form action={…}>` oder direkt
  aufgerufen.

### Service (`src/services/<domain>/...ts`)

- KEIN `'use server'`.
- KEIN Auth-Check (Caller muss das machen).
- Pure Business-Logik, testbar.
- Bekommt Supabase-Client als Parameter.
- Wird sowohl aus Server-Actions als auch aus API-Routes
  (`src/app/api/...`) aufgerufen.

### Beispiel

```ts
// src/services/workflow/instantiate.ts
export async function instantiateBookingTasks(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ created: number; skipped: number; error?: string }> {
  // pure logic
}

// src/server/workflow/actions.ts
'use server';
export async function regenerateBookingTasks(bookingId: string) {
  await requireRole(['admin', 'office']);
  const supabase = createSupabaseServerClient();
  const r = await instantiateBookingTasks(supabase, bookingId);
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true, created: r.created };
}
```

---

## Datenbank-Zugriff

### Wo wird Supabase importiert?

- **Server-Actions & Pages**: `createSupabaseServerClient()`
  aus `@/lib/supabase/server`
- **Cron-Jobs / Edge-Functions**: `createSupabaseServiceClient()`
  aus `@/lib/supabase/service` (umgeht RLS, nur für interne Cron)
- **Browser**: `createSupabaseBrowserClient()` aus
  `@/lib/supabase/browser` — nur Auth-Flow, sonst alles via Server-Action

### Joins / PostgREST

- PostgREST liefert Joins als Array (`{ apartment: [{ number: '...' }] }`)
  obwohl es eine 1:1-Relation ist.
- Wir typisieren das im Caller manuell:
  `r.apartment as unknown as { number: string } | null`.
- Als nächste Verbesserung: `pnpm db:types` ausführen und die generierten
  Typen in `src/types/db.ts` einlesen, dann brauchen wir die Casts nicht.

### Storage

- Bucket `cleaning-photos` → Reinigungs-Fotos (max 20 MB, JPG/PNG/WebP)
- Bucket `tenant-documents` → Verträge, Pässe, Übergabe-Protokolle
  (max 20 MB, PDF + Bilder)
- Beide privat — Zugriff nur via signierte URLs (`createSignedUrl`,
  60 Min gültig).
- Pfad-Konvention: `<bucket>/<entität-id>/<dateiname>`,
  z. B. `cleaning-photos/<task-id>/2025-04-15-foto1.jpg`.

---

## Wann was wo

| Aufgabe                                   | Wo machen?                               |
|-------------------------------------------|------------------------------------------|
| Neue DB-Spalte                            | Migration `YYYYMMDDHHMMSS_<name>.sql`    |
| Neue Validation-Regel                     | Service oder Server-Action mit zod        |
| Neue Page                                 | `src/app/(app)/<domain>/page.tsx`         |
| Daten laden für eine Page                 | Direkt in Server-Component, oder Service  |
| Mutation (POST/PUT/DELETE)                | Server-Action, ruft Service               |
| Cron-Trigger                              | `src/app/api/cron/<name>/route.ts`        |
| iCal/PDF-Export                           | `src/app/api/<domain>/<name>/route.ts`    |
| Neue React-Komponente, wiederverwendbar   | `src/components/ui/<name>.tsx`            |
| Neue React-Komponente, modul-spezifisch   | `src/app/(app)/<domain>/<name>.tsx`       |
| Hilfsfunktion, generisch                  | `src/lib/<bereich>.ts`                    |
| Hilfsfunktion, modul-spezifisch           | `src/services/<domain>/<name>.ts`         |

---

## Tests (Wishlist)

Aktuell keine Tests vorhanden. Roadmap:

1. **Vitest** für Services in `src/services/` —
   Pure-Funktion-Tests, kein DB-Mocking nötig wenn wir das Schema
   mocken.
2. **Playwright** für die kritischen User-Journeys:
   - Login → Dashboard
   - Buchung erstellen → Workflow-Tasks erscheinen
   - Reinigungs-Drag&Drop
3. **GitHub Actions**: bei jedem Push `pnpm typecheck && pnpm test`.

---

## Anti-Patterns (was wir vermeiden)

- ❌ **Page macht direkten Supabase-Insert**. → Immer via Server-Action.
- ❌ **`'use server'` in Service-Datei**. → Services bleiben pure.
- ❌ **Server-Action ruft React-Hook**. → React läuft nur im Browser/SSR.
- ❌ **Tabellen-Direktzugriff ohne RLS**. → Immer prüfen ob Service-Client
  oder User-Client gewollt ist.
- ❌ **Migration ändert Daten produktiv** (`update apartments set …`)
  ohne `where`. → Statt-Migrations sollten in `seed.sql` oder als
  Server-Action laufen.
- ❌ **`as any` oder `// @ts-ignore`**. → Stattdessen sauber typen, oder
  `as unknown as <typ>` mit Begründungs-Kommentar.
- ❌ **17 Migrationen für ein einzelnes Feature**. → Bei neuen Features
  möglichst eine Migration; bei nachträglichen Fixes ist
  Schema-Migration ok.

---

## Versionierung

- `main`-Branch = Production.
- Feature-Branches: `feat/<name>`, `fix/<name>`.
- Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`.
- Vercel deployt `main` automatisch nach jedem Push.

---

## Weitere Doku

- `README.md` — Onboarding & lokales Setup
- `DEPLOYMENT.md` — Vercel + Hosted Supabase aufsetzen
- `MIGRATION-RESET.md` — Konsolidierte Migration auf Cloud anwenden
- `docs/` — Domain-Doku (Annahmen, Roadmap, Datenmodell)
