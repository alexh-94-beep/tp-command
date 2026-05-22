# Migration-Reset – TP-Command

Wie man die konsolidierte Init-Migration sauber auf eine Datenbank anwendet –
lokal, auf `tp-command-dev` oder (mit Vorsicht) auf `tp-command-prod`.

Diese Version berücksichtigt die **Zwei-Projekt-Strategie** (dev/prod). Die
v1-Version kannte nur ein einziges Projekt.

---

## Wann braucht man einen Reset?

- Die DB ist in einem inkonsistenten Zustand und soll dem Migrations-Stand
  exakt entsprechen.
- Ein bestehendes Supabase-Projekt (z. B. das alte v1-Projekt) soll als
  frische `tp-command-dev`-DB wiederverwendet werden.
- Lokal nach Schema-Experimenten.

> **Reset = Datenverlust.** Auf `tp-command-prod` nur dann, wenn die DB noch
> keine echten Daten enthält. Sobald produktiv gearbeitet wird, niemals mehr.

---

## Variante A – Lokal (Standardfall)

`supabase db reset` verwirft die lokale DB, spielt **alle** Migrationen aus
`supabase/migrations/` neu ein und führt danach `supabase/seed.sql` aus.

```bash
supabase db reset
```

Danach DB-Typen neu generieren:

```bash
pnpm db:types        # supabase gen types typescript --local > src/types/db.ts
```

---

## Variante B – Cloud-Projekt (dev oder prod)

### B1. Migrationen anwenden (Projekt ist leer / frisch)

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

`supabase db push` spielt alle noch nicht angewendeten Migrationen ein.

### B2. Voll-Reset eines bestehenden Cloud-Projekts

Wenn ein Cloud-Projekt komplett zurückgesetzt werden soll (z. B. das alte
v1-Projekt → frische dev-DB), reicht ein simples `drop schema public` **nicht**.

**Wichtige Stolpersteine:**

1. **`drop schema public cascade` löscht nur `public`.** Die
   **Storage-Policies liegen im `storage`-Schema** und bleiben hängen. Sie
   müssen separat entfernt werden, sonst kollidiert die Init-Migration beim
   Neu-Anlegen der Bucket-Policies.
2. **Das Migrations-Tracking muss zurückgesetzt werden.** Supabase merkt sich
   in `supabase_migrations.schema_migrations`, welche Migrationen schon liefen.
   Bleibt diese Tabelle gefüllt, überspringt `db push` die Init-Migration.

Im **SQL-Editor des Supabase-Dashboards** des betreffenden Projekts ausführen:

```sql
-- 1. public-Schema komplett leeren
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres;

-- 2. Storage-Policies aus dem storage-Schema entfernen
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

delete from storage.buckets where id in ('cleaning-photos', 'tenant-documents');

-- 3. Migrations-Tracking leeren
truncate supabase_migrations.schema_migrations;
```

Danach lokal:

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

### B3. Typen aus dem Cloud-Projekt generieren

```bash
pnpm db:types:remote     # supabase gen types typescript --linked > src/types/db.ts
```

---

## Reihenfolge der Migrationen

Die Dateien werden nach Zeitstempel sortiert angewendet:

1. `20260521000000_init.sql` – Gesamtschema
2. `20260521000100_status_today_fallback.sql` – View `view_apartment_status_today`
3. `20260521000200_tenant_kind_company_value.sql` – Enum-Wert `company`
4. `20260521000300_tenant_company.sql` – Firmenmieter-Spalten + Constraint

> Migration 3 und 4 sind bewusst getrennt: Postgres erlaubt einen frisch per
> `ALTER TYPE ... ADD VALUE` hinzugefügten Enum-Wert nicht in derselben
> Transaktion zu verwenden (Fehler `55P04`). Der Wert `company` muss erst
> committet sein, bevor Constraint und Index ihn benutzen können. **Diese
> Trennung nicht wieder zusammenführen.**

---

## Nach jedem Schema-Wechsel

DB-Typen neu generieren, sonst läuft `pnpm typecheck` gegen ein veraltetes
`src/types/db.ts`:

```bash
pnpm db:types          # lokal
pnpm db:types:remote   # gegen das verlinkte Cloud-Projekt
```
