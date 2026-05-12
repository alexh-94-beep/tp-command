/**
 * scripts/import-apartments.ts
 *
 * Phase-1-Import der 180 Wohnungen aus
 * `NEU_Mietzinsspiegel_TPApartments_mit_Reservierungen.xlsx` →
 * Tabelle `apartments`.
 *
 * Quelle (vorbereitet): scripts/data/apartments-import.json
 *
 * Nutzung:
 *   pnpm import:apartments -- --dry-run    # validiert nur, schreibt nichts
 *   pnpm import:apartments                 # echter Upsert
 *
 * Env-Vars (aus .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  ← Service-Role-Key, nicht Anon!
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { config } from 'dotenv';

// .env.local laden (vor Zugriff auf process.env!)
config({ path: resolve(process.cwd(), '.env.local') });

// ---------------------------------------------------------------------------
// Validierungs-Schema (deckt sich mit DB-Constraints)
// ---------------------------------------------------------------------------
const ApartmentSchema = z.object({
  number:       z.string().regex(/^[A-Z]\.\d{4}$/, 'Code muss <Buchstabe>.<4-Ziffern> sein'),
  building:     z.enum(['C', 'D', 'E']),
  type:         z.enum(['junior', 'senior', 'suite', 'studio']),
  floor:        z.number().int().min(0).max(20).nullable(),
  size_sqm:     z.number().positive().nullable(),
  orientation:  z.string().min(1).nullable(),
  standard_rent: z.number().int().nonnegative(),
  status: z.enum([
    'available', 'occupied', 'terminated', 'contract_pending',
    'booking_active', 'maintenance', 'blocked',
  ]),
  ownership: z.enum(['own', 'sold_managed', 'sold_external']),
  current_tenant_label: z.string().nullable(),
  current_move_in:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  current_move_out:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  furnishing_completion: z.number().min(0).max(1),
});

type Apartment = z.infer<typeof ApartmentSchema>;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');

// ---------------------------------------------------------------------------
// JSON laden + validieren
// ---------------------------------------------------------------------------
const dataPath = resolve(process.cwd(), 'scripts/data/apartments-import.json');
console.log(`📂 Lade ${dataPath}`);

const raw: unknown = JSON.parse(readFileSync(dataPath, 'utf-8'));
if (!Array.isArray(raw)) {
  console.error('❌ JSON-Root ist kein Array');
  process.exit(1);
}
console.log(`   ${raw.length} Records gelesen`);

const records: Apartment[] = [];
const errors: { index: number; record: unknown; issues: z.ZodIssue[] }[] = [];

raw.forEach((rec, i) => {
  const parsed = ApartmentSchema.safeParse(rec);
  if (parsed.success) records.push(parsed.data);
  else errors.push({ index: i, record: rec, issues: parsed.error.issues });
});

if (errors.length > 0) {
  console.error(`❌ ${errors.length} Records mit Validation-Fehlern:`);
  errors.slice(0, 10).forEach(({ index, record, issues }) => {
    const num = (record as { number?: string })?.number ?? '?';
    console.error(`   [${index}] ${num}: ${issues.map(i => `${i.path.join('.')}=${i.message}`).join('; ')}`);
  });
  if (errors.length > 10) console.error(`   … und ${errors.length - 10} weitere`);
  process.exit(1);
}
console.log(`✅ Alle ${records.length} Records sind valide`);

// ---------------------------------------------------------------------------
// Statistik-Auszug
// ---------------------------------------------------------------------------
const countBy = <T extends string>(arr: T[]): Record<T, number> =>
  arr.reduce((acc, v) => { acc[v] = (acc[v] ?? 0) + 1; return acc; }, {} as Record<T, number>);

console.log('\n📊 Verteilungen:');
console.log('   Building:  ', countBy(records.map(r => r.building)));
console.log('   Type:      ', countBy(records.map(r => r.type)));
console.log('   Status:    ', countBy(records.map(r => r.status)));
console.log('   Ownership: ', countBy(records.map(r => r.ownership)));

if (DRY_RUN) {
  console.log('\n💡 --dry-run aktiv: kein DB-Zugriff, beende hier.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Supabase-Verbindung (Service-Role) + Upsert
// (gewrapped in async main, weil tsx als CJS keine top-level-await mag)
// ---------------------------------------------------------------------------
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  console.log(`\n🚀 Upsert ${records.length} Wohnungen nach Supabase …`);

  const { data, error, count } = await supabase
    .from('apartments')
    .upsert(records, { onConflict: 'number', count: 'exact' })
    .select('number');

  if (error) {
    console.error('❌ Supabase-Fehler:', error.message);
    if (error.details) console.error('   Details:', error.details);
    if (error.hint)    console.error('   Hint:   ', error.hint);
    process.exit(1);
  }

  console.log(`✅ ${count ?? data?.length ?? 0} Zeilen geschrieben`);

  const { count: total } = await supabase
    .from('apartments')
    .select('*', { count: 'exact', head: true });

  console.log(`📦 Tabelle apartments: ${total} Zeilen total`);

  if (total !== records.length) {
    console.warn(`⚠️  Erwartet: ${records.length}, in DB: ${total}. Bitte nachprüfen.`);
  }
}

main().catch((err) => {
  console.error('❌ Unerwarteter Fehler:', err);
  process.exit(1);
});
