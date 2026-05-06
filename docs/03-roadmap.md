# MVP Roadmap

Ziel des MVP: Die SharePoint-Excel ablösen. Das Team soll täglich nur noch in
TP-Command arbeiten – Belegung sehen, Buchungen erfassen, Reinigungen koordinieren,
Zahlungen prüfen. Booking.com-Buchungen kommen automatisch rein.

Phasen sind so geschnitten, dass nach **jeder Phase** etwas Produktives nutzbar
ist. Zeitangaben sind grobe Orientierung für ein 1–2-Personen-Team.

---

## Phase 0 – Foundation (≈ 1–2 Wochen)

**Ziel:** Skelett steht, alles deployt, eingeloggt.

- [ ] Repo aufsetzen (Next.js 14 + TypeScript + Tailwind + ESLint/Prettier)
- [ ] Supabase-Projekt anlegen, lokales `supabase/`-Setup
- [ ] DB-Schema als Migrationen (siehe `02-datenmodell.md`)
- [ ] Seed-Skript mit 5 Demo-Wohnungen, 2 Mietern, 1 Buchung
- [ ] Supabase Auth mit Magic Link
- [ ] Rollenmodell + RLS-Policies (initial sehr restriktiv)
- [ ] Layout: Sidebar, Topbar, geschützte Routen
- [ ] Vercel-Deployment + Preview-URLs aus PRs
- [ ] Sentry verdrahtet

**DoD:** Alex und 1 Office-Person können sich einloggen und sehen ein leeres
Dashboard mit den 4 Kacheln (noch ohne Inhalt).

---

## Phase 1 – Wohnungen, Mieter, Buchungen, Belegung (≈ 2–3 Wochen)

**Ziel:** Excel ist offiziell ablösbar – nur noch ohne Booking-Automatik.

- [ ] CRUD Wohnungen (Liste, Detail, Form, Validation)
- [ ] CRUD Mieter/Gäste
- [ ] CRUD Buchungen für alle drei Mietarten
- [ ] Verfügbarkeits-Check (Service + DB-Constraint)
- [ ] Warnung bei Überschneidung mit klarer Fehlermeldung
- [ ] Blockierungen anlegen (Wartung, Eigennutzung)
- [ ] Kalenderansicht: Monat & Liste, Filter nach Wohnungstyp
- [ ] Dashboard v1: aktuelle Belegung, freie Wohnungen, kommende Ein-/Auszüge
- [ ] CSV-Import bestehender Excel-Belegung (einmaliger Migrations-Pfad)

**DoD:** Office kann eine Woche lang ausschliesslich in TP-Command arbeiten und
weiss zu jedem Zeitpunkt, welche Wohnung wann von wem belegt ist.

---

## Phase 2 – Reinigung & Zahlungen (≈ 2 Wochen)

**Ziel:** Reinigungs­team arbeitet vom Handy, Office sieht offene Beträge.

- [ ] Service `cleaning/generate.ts`: erzeugt automatisch
      `checkout`-Auftrag bei Auszug und `pre_checkin` bei langem Leerstand
- [ ] Reinigungsliste (Office) mit Filter Status / Datum / Wohnung
- [ ] Mobile Sicht (`/cleaning/mobile`): grosse Buttons, Status-Update,
      Notiz, Foto-Upload
- [ ] Qualitätskontrolle durch Office (`done` → `quality_checked`)
- [ ] Zahlungen pro Buchung erfassen (Type, Betrag, Datum, Methode)
- [ ] Trigger: `bookings.payment_status` aus `payments` neu berechnen
- [ ] Ampellogik in der UI (rot / gelb / grün)
- [ ] Dashboard v2: offene Reinigungen, offene Zahlungen, Handlungsbedarf

**DoD:** Reinigungsteam pflegt 100 % der Aufträge in der App. Office sieht
auf einen Blick alle überfälligen Mieten und Depots.

---

## Phase 3 – Booking.com Anbindung (≈ 2–3 Wochen)

**Ziel:** Booking-Buchungen landen ohne manuelles Tippen im System.

- [ ] `ChannelAdapter`-Interface, generische Channel-Verwaltung
- [ ] Booking iCal-Pull alle 15 Minuten via Vercel Cron
- [ ] Booking iCal-Push pro Wohnung (eigener Endpoint)
- [ ] Auto-Zuweisung neuer Booking-Reservierungen (Service `allocation/autoAssign`)
- [ ] Konflikt-Notification an Office bei mehrdeutiger oder fehlender Wohnung
- [ ] Booking-Felder im Buchungs-Detail (externe ID, Channel, Auszahlung)
- [ ] Tracking Booking-Auszahlungen pro Buchung
- [ ] Logik dokumentiert + Test-Suite

**DoD:** Eine neue Booking.com-Reservierung erscheint binnen 15 Min in TP-Command,
ist einer Wohnung zugewiesen, und der Auszug-Reinigungs­auftrag ist bereits
geplant.

---

## Phase 4 – Kommunikation & Polish (≈ 2 Wochen)

**Ziel:** Mails als Entwurf erzeugbar, App fühlt sich rund an.

- [ ] react-email Templates: welcome, checkin, wifi, payment_reminder, checkout
- [ ] Service `communications/render.ts` füllt Templates mit Buchungs-Daten
- [ ] UI: Vorschau & manuelles Versenden (Resend), Versand-Historie
- [ ] Geplante Trigger (Cron): Reminder X Tage vor Auszug, X Tage nach
      offener Zahlung
- [ ] Audit Log Sicht für Admins
- [ ] Onboarding-Doku im Repo + Quick-Start-Video
- [ ] UX-Pass: Tastatur-Shortcuts, leere Zustände, Error-States
- [ ] Performance-Pass: Indexe, N+1-Checks

**DoD:** Mit Phase 4 ist das MVP live im Tagesbetrieb. Die SharePoint-Excel
wird archiviert.

---

## Phase 5+ (Post-MVP, nicht eingeplant)

In dieser Reihenfolge wahrscheinlich:

1. Airbnb Channel (iCal zuerst, später API)
2. Expedia Channel
3. Direktbuchungen über Website (Buchungs­formular + Verfügbarkeitsanzeige)
4. Echte Booking Connectivity API (statt iCal) für Preise / ARI-Push
5. Immotop Read-Sync (Verträge spiegeln)
6. Flatfox Read-Sync (Vertragsstatus, Depot-Status)
7. Reporting/KPIs (Auslastung, ADR, RevPAR, Channel-Mix)
8. Mehrsprachigkeit DE/EN
9. Stripe / Datatrans für Online-Zahlungen
10. Mehrmandantenfähigkeit (falls weitere Bestände dazukommen)

---

## Qualitätskriterien (gelten ab Phase 1)

- Jede neue Service-Funktion hat einen Vitest.
- Jeder Pull Request muss durch CI (Lint, Typecheck, Unit-Tests).
- Migrationen werden nie nach dem Merge editiert.
- RLS bleibt aktiv – auch in Dev. Service-Role-Key nur in Cron/Webhook.
- Performance-Budget Dashboard: < 800 ms TTFB.

## Risiken & Gegenmassnahmen

| Risiko | Gegenmassnahme |
|--------|----------------|
| Booking.com iCal hat 15-Min-Lag | iCal als Bridge, ARI-Webhook später, Konflikt-UI für Edge Cases. |
| Reinigungs­team ohne Tech-Affinität | Mobile UI mit grossen Buttons, nur 3 Klicks bis „erledigt". |
| Doppelbelegung in Excel-Migration | Import-Skript zeigt Konflikte vor dem Schreiben, Office bestätigt manuell. |
| RLS-Lücken | Pen-Test-ähnliche Test-Suite, die jede Tabelle aus jeder Rolle prüft. |
