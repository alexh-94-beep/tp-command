# Deployment – TP-Command

Dieses Dokument beschreibt das Aufsetzen der **getrennten dev/prod-Umgebungen**
auf Supabase und Vercel. Es ersetzt die v1-Version, die nur ein einziges
Supabase-Projekt kannte.

---

## 1. Umgebungs-Strategie

Es gibt **zwei Supabase-Projekte** und **drei Vercel-Umgebungen**:

| Vercel-Umgebung | Git-Branch            | Supabase-Projekt    | URL                            |
|-----------------|-----------------------|---------------------|--------------------------------|
| Production      | `main`                | `tp-command-prod`   | `tp-command.vercel.app`        |
| Preview         | jeder Feature-Branch  | `tp-command-dev`    | automatische Preview-URL pro PR |
| Development     | lokal (`pnpm dev`)    | `tp-command-dev`    | `localhost:3000`               |

**Grundregeln:**

- Die **prod-DB wird nie direkt bearbeitet.** Schema-Änderungen laufen immer
  über Migrationen, zuerst auf `dev` getestet.
- Ein Feature-Branch zeigt **immer** auf `tp-command-dev` – nie auf prod.
- Env-Vars werden in Vercel **pro Umgebung** gesetzt (Abschnitt 5).

---

## 2. Die zwei Supabase-Projekte anlegen

> Diese Schritte macht **Alex** im Supabase-Dashboard (https://supabase.com/dashboard).
> Claude Code kann keine Cloud-Konten bedienen.

Für **jedes** der beiden Projekte:

1. **New project** klicken.
2. Name: `tp-command-dev` bzw. `tp-command-prod`.
3. Region: **Frankfurt (eu-central-1)**.
4. Ein **Database Password** vergeben und sicher notieren (Passwort-Manager).
5. **Create new project** – die Bereitstellung dauert 1–2 Minuten.

### Welche Werte Claude Code braucht

Pro Projekt aus **Project Settings → API** (bzw. **Data API** / **API Keys**):

| Wert                        | Wofür                                              |
|-----------------------------|----------------------------------------------------|
| **Project URL**             | `NEXT_PUBLIC_SUPABASE_URL`                         |
| **anon / publishable key**  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (öffentlich, RLS schützt) |
| **service_role / secret key** | `SUPABASE_SERVICE_ROLE_KEY` (NUR serverseitig)   |
| **Project Ref**             | für `supabase link` (steht auch in der Project-URL) |

Zusätzlich aus **Project Settings → Database** das **Connection String /
Database Password** – wird für `supabase db push` gebraucht.

> **Hinweis:** Aus v1 existiert bereits ein Supabase-Projekt
> (`tkqbeqkqqqzsgswbrvoi`, Frankfurt). Es kann als `tp-command-dev`
> weiterverwendet (umbenennen + DB zurücksetzen, siehe MIGRATION-RESET.md)
> oder gelöscht werden. Frei entscheidbar.

---

## 3. Supabase-CLI mit dem dev-Projekt verbinden

```bash
# Einmalig: CLI gegen den Supabase-Account authentisieren
supabase login

# dev-Projekt verlinken (Ref aus Abschnitt 2)
supabase link --project-ref <DEV_PROJECT_REF>

# Init-Migration auf dev anwenden
supabase db push
```

`supabase db push` wendet alle Dateien aus `supabase/migrations/` an:

- `20260521000000_init.sql` – Komplettschema (25 Tabellen, ~40 Enums, RLS,
  Trigger, 3 Views, 2 Storage-Buckets, 6 Workflow-Templates)
- `20260521000100_status_today_fallback.sql` – View-Fallback
- `20260521000200_tenant_kind_company_value.sql` – Enum-Wert `company`
- `20260521000300_tenant_company.sql` – Firmenmieter-Schema

Die **Storage-Buckets** (`cleaning-photos`, `tenant-documents`) entstehen
durch die Migration – kein manueller Schritt im Dashboard.

### Schema von dev nach prod bringen

Wenn `dev` getestet ist:

```bash
supabase link --project-ref <PROD_PROJECT_REF>
supabase db push
supabase link --project-ref <DEV_PROJECT_REF>   # wieder zurück auf dev
```

Details zum Voll-Reset einer Cloud-DB: siehe `MIGRATION-RESET.md`.

---

## 4. Auth-URLs in Supabase setzen

Pro Projekt unter **Authentication → URL Configuration**:

- **tp-command-prod:** Site URL `https://tp-command.vercel.app`,
  Redirect URLs `https://tp-command.vercel.app/**`
- **tp-command-dev:** Site URL `http://localhost:3000`,
  Redirect URLs `http://localhost:3000/**` und das Vercel-Preview-Muster
  `https://*-<dein-vercel-scope>.vercel.app/**`

Login läuft über E-Mail + Passwort – die Team-User werden im Dashboard unter
**Authentication → Users → Add user** angelegt (E-Mail + Passwort,
„Auto Confirm User" aktivieren). Das in **beiden** Projekten.

Danach `supabase/seed-prod.sql` im SQL-Editor ausführen – es verknüpft die
auth-User über die E-Mail mit `public.users` und vergibt die Rollen
(Alex = admin, Brian/Sharon = office, Mireme = cleaning).

---

## 5. Vercel-Projekt verbinden

> Diese Schritte macht **Alex** auf https://vercel.com.

1. **Add New… → Project**, das GitHub-Repo `alexh-94-beep/tp-command` importieren.
2. Framework wird als **Next.js** erkannt, Package-Manager **pnpm**.
3. **Vor dem ersten Deploy** die Environment-Variables setzen (siehe unten).
4. **Deploy** klicken.

### Environment-Variables – pro Umgebung

In **Project Settings → Environment Variables**. Wichtig: bei jeder Variable
die zutreffenden **Environments** ankreuzen.

**Für `Production` (zeigt auf `tp-command-prod`):**

| Variable                        | Wert                                  |
|----------------------------------|---------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`       | prod Project URL                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | prod anon key                         |
| `SUPABASE_SERVICE_ROLE_KEY`      | prod service_role key                 |
| `NEXT_PUBLIC_APP_URL`            | `https://tp-command.vercel.app`       |
| `APP_TIMEZONE`                   | `Europe/Zurich`                       |
| `APP_CURRENCY`                   | `CHF`                                 |
| `CRON_SECRET`                    | langer Zufallswert (`openssl rand -hex 32`) |

**Für `Preview` + `Development` (zeigen auf `tp-command-dev`):**

Dieselben Variablen, aber mit den **dev**-Supabase-Werten und
`NEXT_PUBLIC_APP_URL` leer lassen bzw. auf die Preview-URL. So kann ein
Feature-Branch nie Produktivdaten anfassen.

> `CRON_SECRET` in allen drei Umgebungen setzen (für Preview/Dev reicht ein
> Testwert). Phasen-spezifische Keys (`FLATFOX_*`, `RESEND_API_KEY`) kommen
> dazu, wenn die jeweilige Phase startet.

---

## 6. Vercel-Cron

`vercel.json` enthält den täglichen Channel-Sync:

```json
{ "crons": [ { "path": "/api/cron/channels", "schedule": "0 6 * * *" } ] }
```

Vercel ruft `/api/cron/channels` täglich um **06:00 UTC** auf und sendet dabei
automatisch `Authorization: Bearer <CRON_SECRET>`. Die Route prüft diesen
Header. In Phase 0 ist die Route ein Platzhalter; die iCal-Pull-Logik kommt in
Phase 6.

---

## 7. Deploy-Ablauf im Alltag

```
Feature-Branch  ──push──▶  Vercel Preview (gegen dev-DB)  ──Review──▶
   Merge nach main  ──▶  Vercel Production (gegen prod-DB)
```

- Jeder Push auf einen Branch erzeugt eine Preview-URL.
- Merge auf `main` deployt automatisch nach Production.
- Schema-Änderungen **vor** dem Merge auf `dev` pushen und auf der Preview-URL
  testen; nach dem Merge `supabase db push` gegen `prod`.
