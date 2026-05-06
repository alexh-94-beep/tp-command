# Architektur & Tech-Stack

## Leitprinzipien

1. **Eine Plattform, klare Schichten.** Wir bauen kein Excel-Replacement,
   sondern ein internes Betriebs­system. Daher: dünner UI-Layer, dicke
   Domain-Logik, austauschbare Adapter für externe Systeme.
2. **Channels sind Plug-ins.** Booking.com, Airbnb, Expedia und die eigene
   Website sprechen über ein gemeinsames `ChannelAdapter`-Interface mit dem
   Kern. Das verhindert, dass Booking-Spezifika quer durch den Code lecken.
3. **Single Source of Truth ist die DB.** Verfügbarkeiten werden nicht in
   der UI berechnet, sondern als SQL-Constraint und in einer Service-Funktion.
   Damit ist jeder Eintragspfad (UI, Webhook, CSV-Import, manueller Eintrag)
   gegen Doppelbelegung geschützt.
4. **Mobile-tauglich von Anfang an.** Reinigungs- und Office-Ansichten werden
   responsiv gebaut. Keine native App im MVP.

## Tech-Stack

| Layer | Wahl | Begründung |
|-------|------|------------|
| Frontend / Server | **Next.js 14 (App Router)** + **TypeScript** | Server Components für schnelle Listen/Dashboards, Server Actions für Mutationen, gleiche Sprache für API-Routes (Webhooks). |
| UI-Styling | **Tailwind CSS** + **shadcn/ui** | Schnell, konsistent, ohne fremde Designsprache. |
| Auth | **Supabase Auth** | E-Mail + Magic-Link, Rollen über `auth.users.app_metadata` und Postgres-Policies. |
| Datenbank | **Supabase Postgres** | Managed Postgres + RLS + Storage + Realtime in einem. |
| Storage | **Supabase Storage** | Reinigungs­fotos, später Vertrags-PDFs. |
| Mail | **Resend** + **react-email** | Templates im Code, Versand erst später aktivieren. |
| Background Jobs | **Vercel Cron** + **Supabase Edge Functions** | Reinigungs­erzeugung, iCal-Sync, Zahlungs­erinnerungen. |
| Tests | **Vitest** (Unit), **Playwright** (E2E) | Standard, low friction. |
| Hosting | **Vercel** + **Supabase Cloud** | Null Ops im MVP. |
| Observability | **Sentry** + **Vercel Analytics** | Fehler & Performance. |

## Schichten

```
┌─────────────────────────────────────────────────────────┐
│  UI            React Server / Client Components         │
│                Tailwind + shadcn/ui                     │
├─────────────────────────────────────────────────────────┤
│  Server        Next.js Server Actions / Route Handlers  │
│                (= dünn, ruft Services auf)              │
├─────────────────────────────────────────────────────────┤
│  Domain /      services/                                │
│  Services      ├─ apartments                            │
│                ├─ bookings  (incl. availability)        │
│                ├─ allocation                            │
│                ├─ cleaning                              │
│                ├─ payments                              │
│                ├─ communications                        │
│                └─ channels (Booking, Airbnb, ...)       │
├─────────────────────────────────────────────────────────┤
│  Data          Supabase Postgres (RLS)                  │
│                Supabase Storage                         │
│                Supabase Auth                            │
└─────────────────────────────────────────────────────────┘
```

UI **ruft niemals direkt die DB**. Alles läuft über `services/*`. Das ist die
einzige Stelle, an der Geschäftsregeln stehen (z. B. „Reinigungs­auftrag wird
beim Auszug automatisch erzeugt").

## Channel-Adapter-Pattern

```ts
// src/lib/channels/types.ts
export interface ChannelAdapter {
  id: 'booking' | 'airbnb' | 'expedia' | 'direct'
  fetchReservations(opts: { from: Date; to: Date }): Promise<ChannelReservation[]>
  pushAvailability?(apartment: Apartment, blocks: DateBlock[]): Promise<void>
  pushPrices?(apartment: Apartment, prices: PriceUpdate[]): Promise<void>
}
```

Jeder neue Channel implementiert dieses Interface. Die Service-Schicht ruft
nie `bookingApi.foo()` direkt auf – nur `channel.fetchReservations(...)`. So
ist die spätere Erweiterung mechanisch.

## Verfügbarkeit & Doppelbelegungs-Schutz

Doppelbelegung wird auf **zwei Ebenen** verhindert:

1. **DB-Constraint**: `EXCLUDE USING gist` über `apartment_id` und einem
   `daterange(start_date, end_date, '[)')`. Postgres lehnt überlappende
   aktive Buchungen ab.
2. **Service-Layer**: `availability.check(apartmentId, range)` wird vor jeder
   Mutation aufgerufen und liefert sprechende Fehler­meldungen plus den
   Reinigungs­puffer.

## Auto-Zuweisung (Booking)

Reihenfolge der Zuweisungs­logik bei eingehender Buchung ohne Wohnungs­wahl:

1. Filter: Wohnungen, die `booking` als erlaubte Vermietungsart haben.
2. Filter: passende Kategorie (Junior/Senior/…).
3. Filter: im gewünschten Zeitraum (inkl. Reinigungs­puffer) frei.
4. Sort: Reihenfolge nach `booking_priority` (DESC), danach nach geringstem
   resultierenden Leerstand (= Tage zwischen Vor-/Nach-Buchung).
5. Falls 0 Treffer → Konflikt-Notification an Office.

## Sicherheit

- Alle Tabellen mit RLS aktiv. Policies sind in `supabase/policies/*.sql`.
- Service-Role-Key wird **nur** in Server Actions / Edge Functions verwendet,
  nie im Browser.
- Webhooks (Booking) werden per HMAC-Signatur verifiziert.

## Was bewusst *nicht* im Stack ist

- Keine externe State-Management-Library (Redux, Zustand) – Server Actions
  + URL-State + React Query reichen.
- Keine NoSQL-DB. Postgres + JSONB für seltene flexible Felder.
- Kein Microservice-Splitting. Modular monolith im Repo, später teilbar.
