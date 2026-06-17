# Performance — Phase 19

Stand: 2026-06-20

## Optimierungen

### 1. Compound-Indexe für Hot-Path-Queries
Migration: [20260620000000_perf_compound_indexes.sql](../supabase/migrations/20260620000000_perf_compound_indexes.sql)

Sieben neue Indexe für die Queries, die im Daily-Use mehrfach pro Page
gefeuert werden:

| Tabelle | Index | Zweck |
|---|---|---|
| `bookings` | `(start_date) WHERE status IN (planned,active)` | Dashboard „heute Einzug" |
| `bookings` | `(end_date) WHERE status IN (planned,active)` | Dashboard „heute Auszug" |
| `cleaning_tasks` | `(status, scheduled_date) WHERE status IN (open,in_progress)` | Dashboard heute/Woche/überfällig |
| `cleaning_tasks` | `(staff_id, scheduled_date) WHERE staff_id IS NOT NULL` | Daily-Board pro Reinigerin |
| `standalone_tasks` | `(created_by, status) WHERE status IN (open,in_progress)` | Mireme-Dashboard „meine erstellten" |
| `audit_log` | `(created_at DESC)` | Settings/Audit Datum-Range + Sort |
| `booking_tasks` | `(assigned_to, status, due_date) WHERE assigned_to IS NOT NULL` | Mireme-Dashboard „meine Workflow-Tasks" |

Alle als **partielle Indexe** mit `WHERE`-Klausel: schmaler + schneller
als Full-Indexe, weil die häufigsten Filter direkt im Index sitzen.

### 2. createSignedUrls (plural) statt N round-trips
[src/app/(app)/cleaning/[id]/page.tsx](../src/app/(app)/cleaning/[id]/page.tsx#L97-L107)

Vorher: pro Foto ein `supabase.storage.createSignedUrl(...)` Call, mit
`Promise.all` parallel — aber trotzdem N Storage-Round-trips.

Jetzt: ein einziger `createSignedUrls(paths[], expiresIn)` Call, danach
Lookup per Map. Bei 10 Fotos: 1 Round-trip statt 10.

### 3. Limits auf Listen-Pages
- `/cleaning` Liste: `.limit(500)`
- `/bookings` Liste: `.limit(500)`

Schutz gegen unbeabsichtigten Full-Scan, vor allem bei `range='all'`.
500 ist großzügig genug für UI-Listen; falls jemand mehr braucht,
soll er filtern.

## Architektur — schon vorher gut
- **Dashboard**: 14 Queries laufen in einem `Promise.all` → parallel statt seriell
- **`/bookings` und `/cleaning`**: status/rental_type Filter via PostgREST `.in()` statt clientseitig
- **Cleaning-Tasks-Embed**: Apartment, Staff, External-Apartment in einer Query
- **Mireme-Dashboard**: `.or('assignee_id.eq.X,created_by.eq.X')` statt zwei Round-trips
- **Auto-Refresh-Cleaning + Mireme-Tasks**: einmaliger Service-Aufruf pro Buchung, nicht in N+1-Loop

## Nicht angefasst (bewusst)
- **Bundle-Size**: Turbopack-Builds zeigen kein detailliertes Bundle-Reporting. Faustregel: kein eigenes Heavy-JS auf Client, Drag&Drop nutzt native HTML5-API.
- **Service-Worker / Offline**: kein Bedarf — Mireme hat WLAN/Mobilfunk.
- **CDN für Static**: Vercel macht das ab Werk.
- **N+1 in `flatfox/applications.ts`**: bereits in `Promise.all` parallel — OK.

## Verifizieren
Nach einer Migration:
```bash
psql "$DATABASE_URL" -c "EXPLAIN ANALYZE select * from cleaning_tasks
  where status in ('open','in_progress') and scheduled_date = current_date"
```
Sollte `Index Scan using cleaning_tasks_status_date_idx` zeigen, nicht
`Seq Scan`.
