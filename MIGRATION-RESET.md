# Cloud-DB auf konsolidierte Migration umstellen

Die 17 alten Migration-Files wurden zu einer einzigen
`supabase/migrations/20260501000000_init.sql` zusammengefasst.

Damit deine Cloud-Supabase auf den neuen Stand kommt, brauchst du
**einen kompletten DB-Reset**. Voraussetzung: noch keine echten
Wohnungen / Buchungen importiert (was aktuell der Fall ist – du bist
gerade beim Setup).

---

## Schritt 1 — Cloud-DB vollständig leeren

Im Supabase-Dashboard:

1. Linkes Menü → **Database → Backups** → ein "On-demand backup"
   triggern (auch wenn fast nichts drin ist – aus Prinzip).
2. Linkes Menü → **Project Settings → Database** → ganz unten
   **Reset database password** ist NICHT was wir wollen. Stattdessen:
3. Linkes Menü → **SQL Editor** → folgenden Block ausführen, um alle
   bestehenden Tabellen + Migration-Tracking zu löschen:

```sql
-- Alle public-Schema-Objekte droppen
drop schema public cascade;
create schema public;
grant all on schema public to postgres, anon, authenticated, service_role;

-- Migration-Tracking zurücksetzen
truncate supabase_migrations.schema_migrations;
```

> ⚠️ Das löscht **alle** Tabellen, Views, Funktionen, Daten im
> `public`-Schema. Das ist gewollt — wir starten gleich frisch mit
> der konsolidierten Migration.

## Schritt 2 — Konsolidierte Migration pushen

Im Terminal:

```bash
cd ~/Documents/Claude/Projects/TP-Command
supabase db push
```

Das wendet `20260501000000_init.sql` an. Die alten 17 Files liegen in
`supabase/migrations/_archive/` und werden von der CLI ignoriert
(Unterordner werden nicht gescannt).

Der Push erstellt:

- 25 Tabellen
- alle Enums (40+)
- alle Indexes + Exclude-Constraints (Doppelbelegungs-Schutz)
- alle RLS-Policies
- alle Trigger (`updated_at` + Payment-Recompute)
- 3 Views (`view_dashboard_kpis`, `view_apartment_status_today`,
  `view_occupancy_calendar`)
- 2 Storage-Buckets (`cleaning-photos`, `tenant-documents`) mit Policies
- 6 Workflow-Templates mit insgesamt 41 Schritten

## Schritt 3 — Auth-User wieder anlegen

Falls du sie schon angelegt hattest, sind sie unter
`auth.users` noch vorhanden — der Reset trifft nur das `public`-Schema.

Falls nicht: Im Dashboard → **Authentication → Users → Add user**:

- a.huber@threepoint.ch (Admin)
- b.schwarz@threepoint.ch (Office)
- s.schwarz@threepoint.ch (Office)
- m.haliti@threepoint.ch (Cleaning)

## Schritt 4 — Seed-Daten einspielen

Im SQL Editor → Inhalt von `supabase/seed-prod.sql` reinkopieren und Run.

Das legt an:

- 7 Channels (Direkt, Flatfox, Booking.com, …)
- User-Profile mit Rollen-Mapping zu auth.users

## Schritt 5 — Verifizieren

Im SQL Editor:

```sql
-- Sollte 25 Tabellen zeigen
select table_name from information_schema.tables
 where table_schema = 'public' order by table_name;

-- Sollte 6 Workflow-Templates zeigen
select code, name, kind, scope from workflow_templates order by code;

-- Sollte 4 Users zeigen (wenn Auth-User angelegt sind)
select email, full_name, role from users order by role, email;
```

---

## Falls etwas schiefgeht

**`drop schema public cascade` schlägt fehl mit "must be owner"**
→ Du benutzt einen Read-only-Connection-String. Im Dashboard SQL-Editor
sollte das aber als Owner laufen. Falls nicht: über `psql` mit dem
`postgres`-User.

**`supabase db push` sagt "no migrations to push"**
→ Migration-Tracking nicht zurückgesetzt. Schritt 1 nochmal, dann
push retry.

**Storage-Buckets schon vorhanden**
→ Die Migration nutzt `on conflict (id) do nothing`, also harmlos.

**RLS-Policy-Konflikt "policy already exists"**
→ Heisst, das `public`-Schema wurde nicht ganz geleert. In den
"Database → Roles" → Storage-Policies sind manuell. Im SQL Editor:

```sql
drop policy if exists "cleaning-photos read auth"               on storage.objects;
drop policy if exists "cleaning-photos write office or cleaning" on storage.objects;
drop policy if exists "cleaning-photos delete admin"             on storage.objects;
drop policy if exists "tenant-documents read auth"               on storage.objects;
drop policy if exists "tenant-documents write office"            on storage.objects;
drop policy if exists "tenant-documents delete admin"            on storage.objects;
```

Dann `supabase db push` retry.

---

## Lokale DB

Falls du auch lokal arbeitest:

```bash
supabase db reset
```

Das macht dasselbe automatisch lokal — droppt + repushed alle
Migrationen + spielt `seed.sql` ein (für Demo-Daten zur lokalen
Entwicklung).
