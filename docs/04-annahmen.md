# Annahmen für das MVP

Damit wir schnell vorankommen, treffe ich an mehreren Stellen sinnvolle Annahmen.
Wenn eine davon nicht zutrifft, korrigiere mich – wir passen die Spezifikation dann
gezielt an.

## Geschäft & Scope

1. **Single Tenant**: Es gibt eine Firma (TP-Command) mit einem Wohnungsbestand.
   Mandantenfähigkeit ist nicht im MVP, die Architektur lässt sie aber zu (jede
   Tabelle bekommt später optional eine `tenant_id`).
2. **Sprache**: UI und Datenbank-Inhalte zuerst auf Deutsch. i18n-Struktur ist
   vorbereitet, aber nicht implementiert.
3. **Währung**: CHF als einzige Währung im MVP. Beträge werden als `numeric(12,2)`
   gespeichert.
4. **Zeitzone**: Europe/Zurich für alle Anzeigen. In der DB läuft alles in UTC,
   Datums­felder ohne Uhrzeit (Einzug/Auszug) bleiben als `date`.
5. **Wohnungen**: Mittlere zweistellige Anzahl (≤ 200) – wir müssen nicht für
   100k Einheiten optimieren.

## Vermietungsarten

6. **Langzeit (≥ 6 Monate)**: Vertrags­abschluss läuft weiterhin in Immotop +
   Flatfox. TP-Command App speichert nur die *Spiegel*-Daten (wer wohnt wann wo,
   Zahlungs- und Vertragsstatus). Keine Synchronisation im MVP – Daten werden
   manuell oder per CSV-Import gepflegt.
7. **Kurzzeit (1–3 Monate)**: Vertrag ebenfalls in Immotop. Depot läuft über
   separaten Einzahlungsschein – die App bildet das mit einer eigenen Zahlungs­
   position (`type = deposit`, `payment_method = manual_slip`) ab.
8. **Booking**: Im MVP wird Booking.com per **iCal Export/Import** angebunden.
   Die volle Booking Connectivity API (ARI + Reservations) ist Phase 5+.

## Buchungs-Lebenszyklus

9. Eine Buchung kann sich überschneidungsfrei nur an genau eine Wohnung binden.
   Wohnungs­wechsel mitten in der Mietzeit wird im MVP als zwei getrennte
   Buchungen abgebildet.
10. **Reinigungspuffer**: Standardmässig wird zwischen Auszug und nächstem
    Einzug auf derselben Wohnung mindestens **6 Stunden** Puffer angenommen
    (auf Wohnungs­ebene überschreibbar).
11. **Auto-Zuweisung Booking**: Greift nur, wenn Buchung über Channel kommt
    und die Wohnung nicht explizit im Channel angegeben wurde. Manuelle
    Buchungen umgehen die Logik.

## Zahlungen

12. Es gibt kein Zahlungs­gateway im MVP. Statusse werden manuell oder per
    Webhook-Import gepflegt. Die Datenstruktur ist aber so, dass Stripe / Datatrans
    später ergänzt werden können.
13. Booking-Auszahlungen kommen monatlich gesammelt – wir tracken sie pro
    Buchung als geplante Forderung gegen Booking.com.

## Reinigung

14. Reinigungs­aufträge werden **automatisch** beim Anlegen einer Auszug- oder
    Booking-Checkout-Position erzeugt. Sie können manuell ergänzt werden.
15. Foto-Upload landet in Supabase Storage (Bucket `cleaning-photos`),
    pro Auftrag max. 20 Bilder.
16. Eine Wohnung gilt erst dann wieder als „bereit", wenn der Status des
    Reinigungs­auftrags `quality_checked` ist (Office gibt frei).

## Benutzer & Rollen

17. **Vier Rollen**: `admin`, `office`, `cleaning`, `management`.
    - `admin` = alles
    - `office` = Wohnungen, Buchungen, Zahlungen, Reinigung sehen/ändern
    - `cleaning` = nur eigene und offene Reinigungs­aufträge sehen/aktualisieren
    - `management` = read-only auf allem inkl. Reports
18. Authentifizierung über Supabase Auth (E-Mail + Magic Link).
19. Row Level Security (RLS) wird ab Phase 1 erzwungen – auch für `admin`,
    nur die Policies sind permissiver.

## Technik

20. **Hosting**: Vercel (Frontend + API Routes), Supabase (DB, Auth, Storage).
21. **Keine Mobile App** im MVP – die Web-App wird responsiv gebaut, sodass
    das Reinigungsteam sie auf dem Handy bedienen kann.
22. **E-Mail-Versand** läuft über Resend (oder Postmark), Templates als
    React-Email. Im MVP nur Plain-Drafts mit Vorschau, kein Auto-Versand.

## Aus Excel-Analyse vom 29.04.2026 nachgezogen

23. **Bestand**: 180 Wohnungen über drei Gebäude `C`, `D`, `E` (je 60).
    Etagen 02–11, je 6 Wohnungen pro Etage, gemischt Junior (1) + Senior (2)*2.
    Wohnungsnummern haben das Schema `<Gebäude>.<EtageZweiStellig><Position>`,
    z. B. `C.0201`. Wir behalten dieses Schema bei.
24. **Verkaufte Wohnungen**: 60 von 180 sind verkauft. Drei Kategorien
    (Feld `apartments.ownership`):
    - `own` – eigene Wohnung
    - `sold_managed` – verkauft, aber Vermietung läuft weiter über uns
    - `sold_external` – verkauft, nicht mehr von uns vermietet (wird als
      Gedankenstütze in der Liste geführt, zählt aber nicht in Dashboard-KPIs).
25. **Status-Werte** sind erweitert auf `available`, `occupied`, `terminated`
    (= aktiv, aber Kündigung steht), `contract_pending` (= Vertrag in Erstellung),
    `booking_active`, `maintenance`, `blocked`.
26. **Türschild-Workflow**: separates Feld `name_tag_status` mit
    `pending` → `ordered` → `installed`. Das ist NICHT Teil von
    `contract_status`, sondern ein operativer Schritt.
27. **Möblierungsgrad** (`furnishing_completion`): Dezimalzahl 0.000–1.000,
    bildet das alte Excel-Feld „Status Einrichtung" ab.
28. **Wartungstermine** (`maintenance_visits`-Tabelle): pro Termin Datum,
    Uhrzeit, Thema, Kontaktmethode (Email/WhatsApp/Telefon), Bestätigungsstatus,
    verantwortliche Person.
29. **Mängel** (`defects`-Tabelle): pro Mangel Kategorie, Schweregrad
    (`low`/`normal`/`high`/`urgent`), Status (`open`/`in_progress`/`resolved`/
    `wont_fix`), gemeldet von / zugewiesen an.
30. **Warteliste** (`waitlist`-Tabelle): Interessenten mit Wunsch-Typ, Wunsch-
    Bezugsdatum, Budget, Status (`open`/`contacted`/`placed`/`dropped`),
    optional zugewiesene Wohnung.
31. **Inventar-Checklisten** (Sheets „Checkliste Junior/Senior") werden im
    MVP NICHT abgebildet. Bleibt vorerst in Excel.
32. **CSV-/Excel-Import** der bestehenden Liste ist Phase-1-Aufgabe und
    muss explizit Verkaufsstatus, Türschild-Status und Möblierungsgrad
    mit-übernehmen.
