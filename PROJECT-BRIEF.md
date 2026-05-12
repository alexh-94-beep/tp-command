# TP-Command — Projekt-Brief

Dieses Dokument ist ein vollständiger Brief für ein neues Claude-Projekt.
Es beschreibt Geschäftskontext, Datenmodell, Workflows, Tech-Stack und die
empfohlene Reihenfolge zum sauberen Aufsetzen.

In ein neues Claude.ai-Projekt einfach den Inhalt als **Project Instructions**
einfügen. Claude kennt damit das gesamte Vorhaben in einem Rutsch.

---

## 1. Geschäftskontext

**Firma:** ThreePoint (in Dübendorf, Schweiz).

**Geschäft:** Wir vermieten 180 möblierte Apartments in 3 Gebäuden (Haus C, D,
E) an der Sonnentalstrasse 13/15/17, 8600 Dübendorf. Es gibt drei
Vermietungsarten:

1. **Langzeitmieten** — ab ca. 6 Monaten. Verträge laufen via Immotop
   (ImmoERP) und Flatfox. Hauptmieter via Flatfox-Anmeldeformular.
2. **Kurzzeitmieten** — 1–3 Monate. Vertrag in Immotop, Kurzzeitpauschale,
   Depot über separates Bankkonto (nicht Flatfox).
3. **Booking-Vermietungen** — Buchungen via Booking.com (zukünftig auch
   Airbnb, Expedia, Direkt-Website). Self-Check-in über Schlüsselboxen.

**Spezialfall Cityus:** Ein Teil der Wohnungen wird langfristig an die Firma
Cityus untervermietet, die ihrerseits die Wohnungen an Endgäste weitervermietet.
Cityus liefert wöchentlich einen Excel-Wochenplan mit Check-in / Check-out
seiner Endgäste, plus Reinigungsanforderungen pro Wohnung. Wir machen die
operative Reinigung und Inspektion für Cityus.

**Heutige Tools (die abgelöst / ergänzt werden sollen):**

- **Immotop (ImmoERP):** Verträge, Mietzinse, Buchhaltung. Bleibt.
- **Flatfox:** Online-Anmeldung Langzeitmieter, Vertragsunterzeichnung,
  Inserate. Bleibt.
- **SharePoint Excel:** zentrale „Belegungs-Liste". Wird durch TP-Command
  ersetzt. Aktuell manuell gepflegt, fehleranfällig, kein Live-Status.

**Ziel von TP-Command:** internes operatives Betriebssystem für die
Vermietung. Eine zentrale Webapp, die den SharePoint-Excel ablöst und alle
Workflows (Einzug, Auszug, Reinigung, Cityus, Booking, Übergaben) abbildet.

---

## 2. Akteure und Rollen

| Rolle        | Personen                          | Rechte                                                         |
|--------------|-----------------------------------|----------------------------------------------------------------|
| `admin`      | Alex Huber (Geschäftsführer)      | volle Rechte, einzige Person die User+Vorlagen ändern darf     |
| `office`     | Brian Schwarz, Sharon Schwarz     | Vermietung, Buchungen, Reinigung dispatchen                    |
| `cleaning`   | Mireme Haliti (Reinigungs-Lead)   | Reinigungs-Aufträge sehen+aktualisieren, eigene zugewiesen     |
| `management` | (zukünftig: Eigentümer-Vertretung)| nur lesen für Reporting                                        |

**Operative Reinigungs-Personen ohne App-Zugang** (eigene Tabelle
`cleaning_staff`): Nicole (100% Solo), Sevdale + Bide (immer als Duo).
Mireme weist denen die Aufgaben zu (Drag&Drop im Wochenplan), die arbeiten
mit gedruckten Tagesplänen.

E-Mail-Adressen Stand heute:
- `a.huber@threepoint.ch`
- `b.schwarz@threepoint.ch`
- `s.schwarz@threepoint.ch`
- `m.haliti@threepoint.ch`

---

## 3. Tech-Stack

- **Next.js 14 App Router** + TypeScript
- **Supabase** (PostgreSQL + Auth + Storage + RLS)
- **Tailwind CSS** für UI
- **react-day-picker** für Datepicker (Safari-Workaround zu native)
- **pdf-lib** für serverseitige PDF-Generierung (Tagesplan, Schadensreport,
  Übergabeprotokoll)
- **xlsx (SheetJS)** für Excel-Import (Cityus-Wochenplan, Wohnungs-Bestand)
- **JSZip** für Flatfox-API-Anhänge
- **Resend** (geplant) für transaktionale E-Mails
- **pnpm** als Package-Manager
- **Vercel** als Hosting

**Externe Integrationen:**

- **Flatfox API** (Bearer Token) — pull Anmeldungen + Listings
- **Booking.com / Airbnb / Expedia** via iCal Pull-Sync
- **Cityus** via Excel-Import (manuell hochgeladen)

---

## 4. Datenmodell (Übersicht)

Etwa 25 Tabellen, die wichtigsten:

### Stammdaten

- `users` — App-User mit Rolle, gespiegelt aus `auth.users`
- `channels` — Direkt, Flatfox, Immotop, Booking.com, Airbnb, Expedia, Website
- `apartments` — 180 Wohnungen mit Building, Typ (junior/senior), Stock,
  Status, Ownership (own/sold_managed/sold_external), allowed_rental_types,
  Standardmiete, Kurzzeitpauschale, Parkplatz, Booking-Priorität, Möblierungs-
  Fertigstellung %, Türschild-Status, Schlüsselbox-Default-Code
- `tenants` — Mieter+Gäste, inkl. Flatfox-Personalien
  (Beruf, Einkommen, Vermieter-Referenz)
- `cleaning_staff` — operative Reinigungs-Personen (Nicole, Sevdale, Bide,
  Mireme) mit Speed-Faktor, Pensum, Team-Name

### Buchungen + Workflows

- `bookings` — Mietverhältnisse aller drei Arten. Felder für
  Übergabe (`move_in_*`) und Abnahme (`handover_*`). Doppelbelegungs-Schutz
  via GiST-Exclude.
- `booking_occupants` — N:M Mieter+Gast pro Buchung (Familie, WG)
- `tenant_documents` — Verträge, Pässe, Übergabeprotokolle (Storage)
- `pending_reservations` — Booking.com-Reservationen ohne Wohnungs-Bezug
  (Pool-Modus), bis ein Office-User sie einer Wohnung zuweist
- `subleasing_stays` — Cityus-Endgäste-Aufenthalte (link zu parent_booking_id)
- `blocks` — Sperren (Wartung, Eigennutzung)
- `payments` — Mieten, Depots, Kurzzeitpauschale, Booking-Auszahlungen
- `workflow_templates` + `workflow_template_tasks` — Vorlagen pro Mietart
  × Einzug/Auszug (Langzeit Einzug = 11 Schritte, Auszug = 10, etc.)
- `booking_tasks` — pro Buchung instanziierte Aufgaben mit Fälligkeit,
  Status (open/in_progress/done/skipped/na), Zuständigkeit

### Reinigung

- `cleaning_tasks` — alle Reinigungs-Aufträge mit Typ
  (`checkout`, `pre_checkin`, `intermediate`, `special`, `deep_clean`,
  `inspection`, `weekly_clean`, `weekly_clean_linen`), Status, Staff-ID,
  Zeitfenster, Zutritts-Methode, Schaden-Felder (für Cityus-Inspektionen)
- `cleaning_schedules` — wiederkehrende Reinigung (wöchentlich/zweiwöchentlich)
- `cleaning_photos` — Foto-Upload pro Auftrag (Storage)
- `external_apartments` — Eigentümer-Wohnungen ausserhalb Bestand, die wir
  reinigen aber nicht vermieten

### Sonstiges

- `apartment_channel_links` — pro Wohnung+Channel: iCal-URLs, externer ID
- `communications` — Versand-Audit (E-Mail, SMS, intern)
- `maintenance_visits` — Wartungstermine
- `defects` — Mängel-Liste
- `waitlist` — Interessenten
- `audit_log` — generisches Audit

### Storage-Buckets

- `cleaning-photos` (privat, max 20 MB, JPG/PNG/WebP)
- `tenant-documents` (privat, max 20 MB, PDF + Bilder)

---

## 5. Wichtige Workflows

### 5.1 Langzeitmieter Einzug (11 Schritte)

Trigger: Anmeldung kommt via Flatfox.

1. Vertrag im ImmoERP erstellen
2. Mietzinskomponente prüfen (Nettomiete, NK, Pauschalen)
3. Parkplatz-Vertrag erstellen *(bedingt: parking_included)*
4. ESR vorbereiten (Einzahlungsschein erste Miete + Depot)
5. Vertrag auf Flatfox laden zur digitalen Unterzeichnung
6. Vertrag-Unterzeichnung prüfen (Reminder nach 7 Tagen)
7. Namensschilder bestellen (Briefkasten + Klingel + Wohnungstür)
8. Übergabetermin festlegen
9. Wohnung übergeben (mit Übergabe-Protokoll als PDF-Upload)
10. Mieter bei Stadt anmelden
11. Stromanbieter melden

### 5.2 Langzeitmieter Auszug (10 Schritte)

Trigger: Kündigung trifft ein.

1. Kündigung im ImmoERP eintragen
2. Kündigungsbestätigung an Mieter
3. Wohnung ausschreiben (Flatfox/Homegate/Website)
4. Abnahmetermin vereinbaren
5. Wohnung abnehmen (mit Abnahmeprotokoll als PDF-Upload)
6. Schäden reparieren *(bedingt: damage_found)*
7. Schaden-Rechnung stellen *(bedingt: damage_found)*
8. Offene Posten prüfen
9. Depot zurückzahlen (Mietkaution / Bankdepot)
10. Akten archivieren

### 5.3 Booking-Gast

Booking.com liefert Reservationen ohne Wohnungs-Bezug → Office weist eine
freie Wohnung manuell zu (mit Auto-Vorschlag basierend auf Verfügbarkeit,
Booking-Priorität, Reinigungspuffer). Cleaning-Auftrag wird automatisch
erzeugt.

### 5.4 Cityus-Workflow

1. Mireme/Office bekommt wöchentlichen Excel-Plan von Cityus per E-Mail.
2. Excel hochladen → System parst Stays + Reinigungs-Anforderungen.
3. Pro Stay: `pre_checkin`, `inspection` und `checkout` Reinigungen werden
   generiert. Wöchentliche Reinigungen werden auch erzeugt
   (`weekly_clean` oder `weekly_clean_linen`).
4. Mireme weist die Reinigungs-Aufträge im Tages- oder Wochenplan per
   Drag&Drop den Reinigungs-Personen zu.
5. Inspektion: wenn `damage_found=true`, kann am Ende der Woche ein
   Schadensreport als PDF generiert werden, der an Cityus geschickt wird.

### 5.5 Reinigungs-Team

- **Mireme** weist Aufgaben zu, macht Qualitätskontrolle, ggf. selbst
  reinigen.
- **Nicole** arbeitet 100% allein, Speed-Faktor 1.0.
- **Sevdale + Bide** arbeiten immer als Duo (Team „Sevdale & Bide"),
  je Speed-Faktor 0.5, Wochenplan rendert sie als eine Zeile.

Tagesplan + Wochenplan als PDF druckbar (pdf-lib), je nach Person.

---

## 6. UI-Module

### `/dashboard`
KPIs (freie Wohnungen, Belegt, Einzüge/Auszüge 7 Tage, offene Reinigungen,
offene Zahlungen, Handlungsbedarf). Sektionen: heute Einzüge/Auszüge/Reinigungen,
Wochen-Vorschau, Offene Workflow-Aufgaben.

### `/apartments`
Liste aller 180 Wohnungen mit Filter (Building, Status, Typ, Ownership,
Suche). Excel-Import. Detailseite mit Bearbeitung, Schlüsselbox-Default-Code,
3D-Link, Notizen.

### `/calendar`
Belegungs-Kalender mit Buchungen+Blocks. Tag/Woche/Monat-Ansicht. Pro Zeile
eine Wohnung, farbcodiert nach Mietart.

### `/bookings`
Buchungs-Liste mit Filter. Detailseite mit:
- Konditionen (Miete, Depot, Parkplatz, Status)
- Wohnungs-Übergabe (Einzug) — Datum/Zeit planen, als erledigt markieren,
  Übergabeprotokoll als PDF hochladen
- Wohnungs-Abnahme (Auszug) — gleich, plus Auto-Reinigungsauftrag
- Workflow-Aufgaben (Einzug + Auszug, gruppiert nach Kategorie)

### `/bookings/flatfox`
Liste der Flatfox-Anmeldungen, „Übernehmen…"-Dialog mit Mieter+Buchung-
Anlage, automatischer Wohnungs-Match (case-insensitive), manuelle
Zuordnung falls Flatfox keine Referenz liefert.

### `/bookings/pending`
Booking.com Pool-Reservationen mit Wohnungs-Vorschlag und Auto-Assign.

### `/cleaning`
Liste aller Reinigungs-Aufträge, Filter, Bulk-Aktionen, Schadensreport-PDF
für Cityus, Cityus-Excel-Import-Button.

### `/cleaning/daily` + `/cleaning/weekly`
Drag&Drop-Boards. Pro Person eine Zeile, Aufgaben verschiebbar zwischen
Tagen/Personen. PDF-Export pro Person.

### `/cleaning/[id]`
Detailseite eines Auftrags mit Inspection-Form (für Cityus), Foto-Upload,
Notizen, Dauer-Erfassung.

### `/tasks`
Globale Aufgaben-Übersicht aller Buchungen, Filter nach Phase, Mietart,
Kategorie, Fälligkeit.

### `/tenants` (noch nicht implementiert)
Mieter/Gäste-CRUD.

### `/settings`
User-Verwaltung, Cleaning-Staff, Channel-Konfiguration (iCal-URLs).

---

## 7. Architektur-Prinzipien (Lessons Learned)

Aus dem ersten Versuch haben wir gelernt — bitte diesmal von Anfang an
beachten:

### Layer-Trennung strikt

```
src/app/         Next.js Pages, ruft Server-Actions oder Services
src/server/      'use server' Actions (mit Auth-Check, zod-Validierung)
src/services/    Pure Business-Logik (keine 'use server', testbar)
src/lib/         Supabase-Client, Helpers (Datum, Geld, etc.)
src/components/  React-UI, kein DB-Wissen
```

Pages laden Daten direkt oder via Services. Mutationen IMMER über
Server-Actions. Services bekommen den Supabase-Client als Parameter
(testbar).

### Konsolidierte Initial-Migration

**EINE** `00000_init.sql` für das gesamte Initial-Schema. Strukturiert in
Sektionen (Extensions, Helper-Funktionen, Enums, Tables, Indexes,
Auth-Rollen-Helper, RLS-Policies, Triggers, Wartungs-Funktionen, Views,
Storage-Buckets+Policies, Workflow-Templates-Seed).

Neue Migrationen kommen nur für nachträgliche Änderungen dazu, niemals
diverse Patches sammeln.

### Auth-Helper-Funktionen mit `security definer`

Wichtig wegen RLS-Rekursion: `auth_role()`, `is_admin()`, `can_write()`,
`is_cleaning()` MÜSSEN `security definer` sein und expliziten
`set search_path = public` haben. Sonst dreht sich Postgres im Kreis,
weil die Policy auf `users` wieder `is_admin()` triggert, das wieder
`auth_role()` aufruft, das wieder die Policy triggert.

```sql
create or replace function auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;
```

### Storage-Buckets via Migration anlegen

Nicht via Dashboard händisch — gehört ins Schema (`storage.buckets`-Insert
mit `on conflict do nothing`), damit DB-Reset reproduzierbar ist.

### Typed Supabase-Types von Anfang an

`pnpm db:types` ausführen und `src/types/db.ts` generieren. Keine
`as unknown as`-Casts in Pages für PostgREST-Joins. Falls casts nötig,
dann mit Kommentar warum.

### Tests früh aufsetzen

- Vitest für Services (Pure-Funktionen, ohne DB-Mock falls möglich)
- Playwright für kritische Journeys (Login → Dashboard, Buchung
  erstellen → Tasks erscheinen, Reinigung Drag&Drop)

### Klare Env-Var-Vorgaben

Immer von Anfang an dokumentieren welche Env-Vars für lokal, Vercel,
Cron gebraucht werden. `.env.example` aktuell halten.

### Routing

Root-Page `src/app/page.tsx` macht `redirect('/dashboard')`. Sonst
landet man bei `tp-command.vercel.app` auf 404.

### Vercel + Supabase Auth-URLs

Site URL + Redirect URLs in Supabase müssen die Production-Domain
enthalten, sonst funktioniert Login-Redirect nicht. Wildcard-Pattern:
`https://tp-command.vercel.app/**`.

### Migrations-Reset auf Cloud

`drop schema public cascade` löscht nur public, **Storage-Policies bleiben
hängen** (sind im storage-Schema). Reset-Script muss beide Bereiche
ansprechen + Migration-Tracking truncaten.

---

## 8. Empfohlene Implementierungs-Reihenfolge

Phasen mit klaren Deliverables, jede Phase ist deploybar:

### Phase 0 — Setup (1 Tag)

- Next.js 14 App + Tailwind + TypeScript scaffolden
- Supabase-Projekt anlegen (lokal + cloud)
- EINE konsolidierte Init-Migration schreiben (alle Tabellen + Indexes +
  RLS + Storage + Workflow-Templates)
- Auth-Helper mit `security definer`
- Login-Form mit E-Mail+Passwort
- Layout (Sidebar + Topbar), Routing
- Vercel-Deploy mit gehosteter Supabase

### Phase 1 — Wohnungen (1 Tag)

- Apartments-Liste mit Filter+Suche
- Excel-Import für die 180 Wohnungen
- Detailseite + Bearbeiten-Form
- Channel-Links (welche Wohnung auf welchem Channel)

### Phase 2 — Buchungen (2 Tage)

- Buchungs-Anlage manuell mit Verfügbarkeitsprüfung
- Belegungs-Kalender (Buchungen + Blocks)
- Tenants/Gäste minimaler CRUD
- Buchungen bearbeiten/stornieren
- Doppelbelegungs-Schutz auf DB-Ebene (Exclude-Constraint)

### Phase 3 — Flatfox (1 Tag)

- API-Adapter (`getApplications`, `getListing`, `downloadAttachment`)
- Anmeldungs-Liste mit Match auf bestehende Wohnungen (case-insensitive)
- Übernehmen-Dialog mit manueller Wohnungs-Zuordnung als Fallback
- Anhänge in Storage speichern

### Phase 4 — Workflow-Engine (1 Tag)

- Templates seeden (6 Stück: Langzeit/Kurzzeit/Booking × Einzug/Auszug)
- Auto-Instantiierung bei Buchungs-Anlage
- Aufgaben-Sektion auf Buchungs-Detail (Häkchen, Notizen, Fälligkeit)
- Globale `/tasks`-Übersicht mit Filter

### Phase 5 — Reinigung Basis (2 Tage)

- Cleaning-Tasks Auto-Generierung (`checkout`, `pre_checkin`)
- Liste + Filter + Detailseite
- Cleaning-Staff-Verwaltung (Speed-Faktor, Pensum, Team)
- Tages-PDF pro Person
- Wochenplan mit Drag&Drop
- Foto-Upload + Inspektions-Form

### Phase 6 — Booking.com (1 Tag)

- iCal-Pull pro Wohnung
- Pool-Modus für generische Listings
- Auto-Wohnungs-Zuweisung mit Scoring
- Cron-Job täglich (Vercel Cron)

### Phase 7 — Cityus (1 Tag)

- Excel-Wochenplan-Parser
- Stays + Wöchentliche Reinigungen + Inspektionen erzeugen
- Schadensreport-PDF an Cityus

### Phase 8 — Übergabe/Abnahme (1 Tag)

- Move-In + Move-Out Planning auf Buchungs-Detail
- PDF-Upload für Übergabe-/Abnahmeprotokoll
- Auto-Trigger Reinigungsauftrag bei Abnahme

### Phase 9 — Dashboard + Polish (1 Tag)

- KPI-Kacheln
- Handlungsbedarf-Sektion (pending_reservations,
  unassigned_cleaning, damage_report, missing_contract, …)
- Offene-Aufgaben-Widget
- Heutige Einzüge/Auszüge/Reinigungen

### Phase 10 — E-Mail-Kommunikation (später)

- Resend integrieren
- Welcome-Mail, Zahlungs-Info, Check-in-Info, WLAN-Info
- Reminder bei offenen Zahlungen

### Phase 11 — Zahlungs-Modul (später)

- Payments-Tabelle aktivieren (Triggers existieren schon)
- Ampel-Logik im UI
- Importe von Bankauszügen (camt.054 oder Excel)

---

## 9. Spezifische Geschäftsregeln (nicht vergessen)

- **Wohnungsnummer-Format:** `C.0406`, `D.0203`, `E.0801` (Building.Stock+Tür)
  — Flatfox liefert manchmal lowercase (`c.0406`), Matching muss
  case-insensitive sein.
- **Open-end-Buchungen** (Langzeit unbefristet): Sentinel `9999-12-31` als
  `end_date`. Bei Anzeige als „unbefristet" rendern.
- **Doppelbelegungs-Schutz:** Postgres-Exclude-Constraint mit
  `daterange(start_date, end_date, '[)')` — überlappende Buchungen mit
  Status `planned` oder `active` werden abgelehnt.
- **Workflow-Bedingungen:** `is_conditional=true` Tasks bekommen Status
  `na` wenn die Bedingung nicht erfüllt ist (z. B. Parkplatz-Vertrag wenn
  `parking_included=false`).
- **Reinigung Dauer-Berechnung:** Lookup-Tabelle pro `source` (booking,
  cityus, own) × `apartment_type` (senior, junior) × `task_type`. Effektive
  Dauer = `estimated * speed_factor`. Duo (Sevdale+Bide) → Summe der
  Speed-Faktoren = 1.0 = volle Geschwindigkeit.
- **Cityus-Subleasing:** `subleasing_stays.parent_booking_id` zeigt auf die
  Master-Buchung mit Cityus als Mieter. Endgast-Reinigungen referenzieren
  `subleasing_stay_id`, nicht direkt `booking_id`.
- **Schlüsselbox-Code:** Default pro Wohnung (`apartments.keybox_default_code`).
  Bei Stay kann ein Override gesetzt werden
  (`subleasing_stays.keybox_code`). Im Tagesplan wird der aktuelle Code
  angezeigt.

---

## 10. Anti-Patterns (was wir vermeiden)

- ❌ Page macht direkten Supabase-Insert (immer via Server-Action)
- ❌ `'use server'` in Service-Datei (Services bleiben pure)
- ❌ 17 Migrationen für ein Initial-Schema (eine konsolidierte init.sql)
- ❌ Auth-Helper ohne `security definer` (RLS-Rekursion)
- ❌ `as any` oder `@ts-ignore` (sauber typen, oder `as unknown as` mit
  Begründung)
- ❌ Storage-Buckets manuell im Dashboard anlegen (in Migration definieren)
- ❌ Page-Title hardcoded (`metadata = { title: '... · TP-Command' }`
  konsistent halten)
- ❌ Magic-Strings für Rollen (`'admin'`) — Enum-Typen aus DB übernehmen

---

## 11. Deployment-Punkte

- **Vercel Cron:** täglich 06:00 UTC für Channel-iCal-Sync
  (`/api/cron/channels`). Auth über `Authorization: Bearer <CRON_SECRET>`.
- **Env-Vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `APP_TIMEZONE=Europe/Zurich`,
  `APP_CURRENCY=CHF`, `CRON_SECRET`, `FLATFOX_API_TOKEN`, `FLATFOX_API_URL`,
  `FLATFOX_WEBHOOK_SECRET`, `BOOKING_ICAL_USER_AGENT=TP-Command/1.0`
- **Supabase Auth URLs:** Site URL = `https://tp-command.vercel.app`,
  Redirect URL Pattern = `https://tp-command.vercel.app/**`.
- **Storage:** Buckets `cleaning-photos` + `tenant-documents` werden via
  Migration angelegt. Beide privat, Zugriff über Signed URLs (60 Min).

---

## 12. Erste Konkrete Aufgabe für ein neues Projekt

Wenn das neue Claude-Projekt startet, mit dieser Aufgabe beginnen:

> Lies diesen PROJECT-BRIEF.md vollständig. Bestätige dass du den Kontext
> verstanden hast (1-2 Sätze). Dann setze Phase 0 um: Next.js-Projekt
> scaffolden, konsolidierte Init-Migration schreiben (alle Tabellen aus
> Sektion 4), Auth-Helper mit `security definer`, Login-Form, Layout,
> erstes Deploy auf Vercel. Stelle Rückfragen nur wenn unklar — sonst
> sinnvolle Annahmen treffen und dokumentieren.

---

## Anhang: Was im ersten Versuch funktioniert hat (kann übernommen werden)

Falls nützlich, der bisherige Code im Repo enthält saubere Implementierungen
für (Files können als Referenz dienen, aber Architektur-Prinzipien aus
Sektion 7 strikt befolgen):

- Flatfox-API-Adapter (`src/lib/channels/flatfox/client.ts`)
- iCal-Parser (`src/lib/channels/booking/ical.ts`)
- Cityus-Excel-Parser (`src/services/import/cityus.ts`)
- Reinigungs-Dauer-Lookup (`src/services/cleaning/duration.ts`)
- Workflow-Instantiierung (`src/services/workflow/instantiate.ts`)
- PDF-Generierung Tagesplan (`src/app/api/cleaning/daily-pdf/route.ts`)
- PDF-Generierung Schadensreport (`src/app/api/cleaning/damage-report-pdf/route.ts`)
- Drag&Drop-Wochenplan (`src/app/(app)/cleaning/weekly/weekly-board.tsx`)

Das Datenmodell aus der konsolidierten Migration (`supabase/migrations/
20260501000000_init.sql`) ist 1:1 als Vorlage nutzbar.
