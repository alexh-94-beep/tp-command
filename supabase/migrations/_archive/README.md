# Archivierte Migrationen

Diese 17 Migration-Files wurden am 06.05.2026 in eine einzige
`20260501000000_init.sql` (im Parent-Ordner) konsolidiert.

Sie liegen hier nur zur Nachvollziehbarkeit / Code-Geschichte.

**Die Supabase-CLI ignoriert Unterordner** unter `migrations/`,
deshalb werden sie weder lokal noch in der Cloud nochmal ausgeführt.

## Reihenfolge & Zweck (chronologisch)

1. `20260501000000_extensions.sql` – pgcrypto, btree_gist
2. `20260501000100_enums.sql` – alle Enum-Typen
3. `20260501000200_tables.sql` – Kerntabellen (apartments, bookings, …)
4. `20260501000300_triggers.sql` – Payment-Recompute-Logik
5. `20260501000400_views.sql` – Dashboard-KPIs, Kalender
6. `20260501000500_policies.sql` – RLS-Policies
7. `20260501001000_flatfox_extension.sql` – Tenant-Felder + booking_occupants + tenant_documents
8. `20260501002000_pool_reservations.sql` – Booking.com Pool-Modus
9. `20260501003000_cleaning_extension.sql` – cleaning_schedules + external_apartments
10. `20260501003100_handover_planning.sql` – `bookings.handover_planned_at`
11. `20260501004000_subleasing_stays.sql` – Cityus-Aufenthalte + Inspektions-Felder
12. `20260501005000_cleaning_extras.sql` – Zutritt + Zeit auf cleaning_tasks
13. `20260501006000_cleaning_staff.sql` – operative Personen ohne App-Zugang
14. `20260501007000_cleaning_duration.sql` – Pensum + Speed-Faktor
15. `20260501008000_cleaning_team.sql` – Team-Konzept (Sevdale & Bide)
16. `20260501009000_workflow_tasks.sql` – Workflow-Vorlagen + booking_tasks
17. `20260501010000_move_in_handover.sql` – Wohnungs-Übergabe-Felder
