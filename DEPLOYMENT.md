# TP-Command – Deployment auf Vercel + Hosted Supabase

Schritt-für-Schritt-Anleitung. Annahme: lokaler Entwicklungsstand läuft,
Vercel-Account existiert, Supabase-Account muss noch angelegt werden.

---

## 1. Hosted Supabase anlegen

1. Auf https://supabase.com einloggen (oder Account erstellen — geht mit GitHub).
2. Oben rechts **New project** → **New Organization** anlegen (z. B. "TP-Command").
3. **New project**:
   - Name: `tp-command-prod`
   - Database password: starkes Passwort generieren — **gut speichern**
   - Region: **Frankfurt (eu-central-1)** (am nächsten zur Schweiz)
   - Plan: **Free** zum Testen reicht; später auf Pro wechseln
4. Warten bis Status grün ist (1–2 Min).
5. Im Projekt: **Project Settings → API** → folgende drei Werte notieren:
   - `Project URL` → wird `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → wird `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` → wird `SUPABASE_SERVICE_ROLE_KEY`
     (⚠️ niemals im Browser, nur Server-side)

## 2. Supabase CLI lokal mit Cloud-Projekt verbinden

Im Terminal, im Projekt-Ordner:

```bash
# CLI-Login (öffnet Browser)
supabase login

# Aktuelles Projekt mit Cloud verknüpfen
# Project-Ref findest du in der Supabase-URL:
#   https://supabase.com/dashboard/project/abcdefghijklmnop
#                                          ^^^^^^^^^^^^^^^^ das hier
# Wichtig: spitze Klammern NICHT mitkopieren!
supabase link --project-ref DEIN_PROJECT_REF_HIER
```

## 3. Migrationen + Seed auf Cloud pushen

```bash
# Alle Migrationen aus supabase/migrations/ deployen
supabase db push

# Seed-Daten einspielen (Channels). User kommen in Schritt 5.
psql "$(supabase db url)" -f supabase/seed-prod.sql
```

> Wenn `psql` nicht installiert ist: alternativ den Inhalt von
> `supabase/seed-prod.sql` im **Supabase-Dashboard → SQL Editor**
> einfügen und ausführen.

## 4. Storage-Buckets anlegen

Im Supabase-Dashboard unter **Storage**:

1. **New bucket** → Name `cleaning-photos`, **Private**, Save
2. **New bucket** → Name `tenant-documents`, **Private**, Save

Buckets sind privat — Zugriff läuft im Code über Signed URLs, das ist
gewollt.

## 5. Auth-Users für das Team anlegen

Im Supabase-Dashboard unter **Authentication → Users → Add user**:

| Email                       | Passwort  | Notiz                  |
|-----------------------------|-----------|------------------------|
| a.huber@threepoint.ch       | (selbst)  | Alex, Admin            |
| b.schwarz@threepoint.ch     | (Brian)   | Brian, Office          |
| s.schwarz@threepoint.ch     | (Sharon)  | Sharon, Office         |
| m.haliti@threepoint.ch      | (Mireme)  | Mireme, Reinigungs-Lead|

Nach dem Anlegen der Auth-User: Im **SQL Editor** den Block aus
`supabase/seed-prod.sql` Abschnitt "User-Profile" nochmal
ausführen — er macht dann das Mapping zwischen `auth.users` und unserer
`users`-Tabelle.

## 6. Auth-Einstellungen für Production

Im Dashboard unter **Authentication → URL Configuration**:

- **Site URL**: `https://<dein-projekt-name>.vercel.app`
- **Redirect URLs** (Add URL):
  - `https://<dein-projekt-name>.vercel.app/**`
  - `http://localhost:3000/**` (für lokale Entwicklung)

Unter **Authentication → Providers**:
- **Email** aktiviert lassen, "Confirm email" deaktivieren (wir wollen
  direktes Login mit Passwort, kein Bestätigungs-Mail).

## 7. GitHub-Repo anlegen (falls noch nicht)

```bash
cd ~/Documents/Claude/Projects/TP-Command
git init       # wenn noch nicht initialisiert
git add .
git commit -m "Initial TP-Command state"

# Auf GitHub neues Privat-Repo anlegen, dann:
git remote add origin git@github.com:<dein-user>/tp-command.git
git branch -M main
git push -u origin main
```

## 8. Vercel-Projekt erstellen

Auf https://vercel.com:

1. **Add New… → Project**.
2. GitHub-Repo `tp-command` importieren.
3. **Framework Preset**: Next.js (auto-detected).
4. **Root Directory**: `./` lassen.
5. **Environment Variables** (alle als "Production, Preview, Development"):

| Name | Wert |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | aus Schritt 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | aus Schritt 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | aus Schritt 1 |
| `NEXT_PUBLIC_APP_URL` | `https://<dein-projekt-name>.vercel.app` |
| `APP_TIMEZONE` | `Europe/Zurich` |
| `APP_CURRENCY` | `CHF` |
| `CRON_SECRET` | Eigenes starkes Random-Passwort. Mit `openssl rand -hex 32` generieren |
| `FLATFOX_API_TOKEN` | aus deiner lokalen `.env.local` |
| `FLATFOX_API_URL` | aus deiner lokalen `.env.local` |
| `FLATFOX_WEBHOOK_SECRET` | aus deiner lokalen `.env.local` |
| `BOOKING_ICAL_USER_AGENT` | `TP-Command/1.0` |
| `RESEND_API_KEY` | (leer lassen, kommt erst mit E-Mail-Modul) |
| `SENTRY_DSN` | (optional, leer lassen) |
| `NEXT_PUBLIC_SENTRY_DSN` | (optional, leer lassen) |

6. **Deploy** klicken.

Beim ersten Deploy lädt Vercel das Repo, baut die App und deployed.
Dauer ca. 2–3 Min.

## 9. Erste Anmeldung testen

Nach erfolgreichem Deploy:

1. URL `https://<dein-projekt-name>.vercel.app` öffnen.
2. Mit `a.huber@threepoint.ch` + Passwort einloggen.
3. Du landest auf dem Dashboard.

## 10. Apartments + Daten importieren

Über **Wohnungen → Import** den Excel-Import nutzen, um die echten
Wohnungen zu laden. Dann kannst du via Flatfox-API die ersten
Anmeldungen synchronisieren.

## 11. Cron-Jobs

Vercel führt automatisch `/api/cron/channels` täglich um 06:00 UTC
(= 07:00/08:00 CH-Zeit) aus. Das holt Booking.com-Events. Konfiguriert
ist das in `vercel.json`. Du kannst das im Vercel-Dashboard unter
**Settings → Cron Jobs** sehen und auch manuell triggern.

> Hinweis: Cron-Jobs sind im Free-Plan auf 1 pro Projekt limitiert,
> wir haben genau einen — passt.

## Nachträgliche Änderungen deployen

Einfach in Git committen und pushen — Vercel deployed automatisch:

```bash
git add .
git commit -m "Beschreibung"
git push
```

Branches → Preview-Deployments. Production = `main`.

## Migrations nachträglich

Wenn neue Migrations dazukommen:

```bash
supabase db push
```

Vercel-App muss dafür nicht neu deployed werden — die Datenbank-
Schema-Änderung greift sofort.

---

## Troubleshooting

**Build-Fehler "missing env"** → Env-Var in Vercel vergessen, Settings
→ Environment Variables prüfen und neu deployen.

**"Invalid login credentials"** → Auth-User in Supabase nicht angelegt
oder Passwort falsch.

**Dashboard zeigt "Forbidden"** → User-Profile-Mapping fehlt: Schritt
5 (zweiten Teil) ausführen.

**Cron schlägt fehl mit 401** → `CRON_SECRET` in Vercel nicht gesetzt
oder mit dem Wert nicht synchron. Nach Änderung muss Vercel neu
deployt werden, damit die Env-Var greift.

**Storage-Upload schlägt fehl** → Bucket `cleaning-photos` oder
`tenant-documents` fehlt. Schritt 4 nachholen.
