# scripts/

Wartungs- und Import-Skripte. Werden über `pnpm run <name>` ausgeführt.

## import-apartments

Importiert die 180 Wohnungen aus `data/apartments-import.json` in die Tabelle `apartments` (Upsert auf Spalte `number`).

**Voraussetzungen:**
- `.env.local` mit `NEXT_PUBLIC_SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` gegen das **richtige** Supabase-Projekt
- `pnpm install` ausgeführt (für `tsx`, `dotenv`, `zod`)

**Verwendung:**

```bash
# Validierung ohne DB-Zugriff (empfohlen vor dem Echt-Lauf)
pnpm import:apartments -- --dry-run

# Echter Upsert
pnpm import:apartments
```

**Quelle der JSON:** Vorbereitet aus `NEU_Mietzinsspiegel_TPApartments_mit_Reservierungen.xlsx` mit folgenden Transformationen:

- Wohnung → `number` (z.B. `C.0201`), Buchstabe daraus → `building`
- Typ → `type` (lowercase: `senior`, `junior`)
- Etage `"02"` → `floor` 2 (int)
- Fläche `"70,0"` → `size_sqm` 70.0
- Status-Mapping:
  - `vermietet` → `occupied`
  - `gekündigt` → `terminated`
  - `verkauft` → `available` (Ownership trägt die Info)
  - `Vertrag erstellt` / `reserviert` → `contract_pending`
  - `verfügbar` → `available`
  - `spezial` → `blocked`
- Ownership: Wenn XLSX-Status = `verkauft` → `sold_external` (60 Wohnungen), sonst `own`
- `Mieter` → `current_tenant_label` (raw, inkl. Notizen)
- `Einzug` / `Auszug` → `current_move_in` / `current_move_out` (date)
- `Status Einrichtung` → `furnishing_completion` (0..1)
