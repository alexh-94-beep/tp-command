-- ============================================================================
-- tenant_kind: Enum-Wert 'company' ergaenzen
-- ----------------------------------------------------------------------------
-- Hintergrund: Cityus mietet als juristische Person 34 Wohnungen. Der bisherige
-- tenant_kind-Enum kannte nur 'tenant' und 'guest'.
--
-- WICHTIG: Postgres erlaubt einen frisch per ALTER TYPE ... ADD VALUE
-- hinzugefuegten Enum-Wert NICHT in derselben Transaktion zu VERWENDEN
-- (Fehler 55P04 "unsafe use of new value"). Das ADD VALUE steht deshalb
-- bewusst in einer EIGENEN Migration; alle Aenderungen, die 'company'
-- benutzen (CHECK-Constraint, Index), folgen in 20260521000300_tenant_company.sql.
-- ============================================================================

alter type tenant_kind add value if not exists 'company';
