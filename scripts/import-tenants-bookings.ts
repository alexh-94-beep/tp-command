/**
 * scripts/import-tenants-bookings.ts
 *
 * Phase 1b: Tenants + Bookings + Apartment-Notes
 *
 * Reihenfolge:
 *   1. Tenants upserten (74 Records, idempotent via id)
 *   2. Bookings inserten (101 Records)
 *      → FK apartment_id wird per number-Lookup aufgelöst
 *   3. apartments.notes für 11 komplexe Strings updaten
 *
 * Nutzung:
 *   pnpm import:tenants-bookings -- --dry-run
 *   pnpm import:tenants-bookings
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local');
  process.exit(1);
}

type Tenant = {
  id: string;
  tenant_kind: 'tenant' | 'guest' | 'company';
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  source: string;
  notes: string | null;
};

type BookingJson = {
  apartment_code: string;
  tenant_id: string;
  rental_type: 'long_term' | 'short_term' | 'booking';
  start_date: string;
  end_date: string;
  rent_amount: number;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  contract_status: 'draft' | 'sent' | 'signed' | 'cancelled';
  notes: string | null;
};

type NoteUpdate = {
  apartment_code: string;
  notes: string;
};

const dataDir = resolve(process.cwd(), 'scripts/data');
const tenants:      Tenant[]      = JSON.parse(readFileSync(`${dataDir}/tenants-import.json`,            'utf-8'));
const bookingsJson: BookingJson[] = JSON.parse(readFileSync(`${dataDir}/bookings-import.json`,           'utf-8'));
const notesUpdates: NoteUpdate[]  = JSON.parse(readFileSync(`${dataDir}/apartments-notes-update.json`,   'utf-8'));

console.log(`📂 Geladen: ${tenants.length} Tenants, ${bookingsJson.length} Bookings, ${notesUpdates.length} Notes-Updates`);

if (DRY_RUN) {
  console.log('💡 --dry-run aktiv: nur Validation, kein DB-Zugriff');
  console.log(`   Tenants — kinds: ${JSON.stringify(countBy(tenants, t => t.tenant_kind))}`);
  console.log(`   Bookings — status: ${JSON.stringify(countBy(bookingsJson, b => b.status))}`);
  console.log(`   Bookings — contract: ${JSON.stringify(countBy(bookingsJson, b => b.contract_status))}`);
  process.exit(0);
}

function countBy<T>(arr: T[], key: (x: T) => string): Record<string, number> {
  return arr.reduce((acc, v) => {
    const k = key(v);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // ---------------------------------------------------------------------------
  // PHASE 1 — Tenants upserten (idempotent via id)
  // ---------------------------------------------------------------------------
  console.log('\n🚀 Phase 1: Tenants upserten');
  const { error: tenError, count: tenCount } = await supabase
    .from('tenants')
    .upsert(tenants, { onConflict: 'id', count: 'exact' });

  if (tenError) {
    console.error('❌ Tenants-Insert-Fehler:', tenError.message);
    if (tenError.details) console.error('   Details:', tenError.details);
    if (tenError.hint)    console.error('   Hint:   ', tenError.hint);
    process.exit(1);
  }
  console.log(`   ✅ ${tenCount ?? tenants.length} Tenants gespeichert`);

  // ---------------------------------------------------------------------------
  // PHASE 2 — Apartment-Lookup: code → id
  // ---------------------------------------------------------------------------
  console.log('\n🔍 Phase 2a: Apartment-IDs lookup');
  const { data: apts, error: aptErr } = await supabase
    .from('apartments')
    .select('id, number');

  if (aptErr) {
    console.error('❌ Apartment-Lookup-Fehler:', aptErr.message);
    process.exit(1);
  }

  const aptIdByCode = new Map<string, string>();
  for (const a of apts!) aptIdByCode.set(a.number, a.id);
  console.log(`   ${aptIdByCode.size} Apartments gefunden`);

  // ---------------------------------------------------------------------------
  // PHASE 2b — Bookings inserten
  // ---------------------------------------------------------------------------
  console.log('\n🚀 Phase 2b: Bookings inserten');
  const bookings = bookingsJson.map((b) => {
    const apartment_id = aptIdByCode.get(b.apartment_code);
    if (!apartment_id) throw new Error(`Apartment ${b.apartment_code} nicht gefunden`);
    return {
      apartment_id,
      tenant_id: b.tenant_id,
      rental_type: b.rental_type,
      start_date: b.start_date,
      end_date: b.end_date,
      rent_amount: b.rent_amount,
      status: b.status,
      contract_status: b.contract_status,
      notes: b.notes,
    };
  });

  // Check ob schon Bookings drin sind (Idempotenz-Schutz)
  const { count: existingBookings } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });

  if ((existingBookings ?? 0) > 0) {
    console.log(`   ⚠️  Es liegen bereits ${existingBookings} Bookings vor — Insert würde duplizieren.`);
    console.log('   Wenn du neu importieren willst: erst Tabelle leeren (DELETE FROM bookings; DELETE FROM booking_occupants;)');
    process.exit(1);
  }

  const { error: bookErr, count: bookCount } = await supabase
    .from('bookings')
    .insert(bookings, { count: 'exact' });

  if (bookErr) {
    console.error('❌ Bookings-Insert-Fehler:', bookErr.message);
    if (bookErr.details) console.error('   Details:', bookErr.details);
    if (bookErr.hint)    console.error('   Hint:   ', bookErr.hint);
    process.exit(1);
  }
  console.log(`   ✅ ${bookCount ?? bookings.length} Bookings gespeichert`);

  // ---------------------------------------------------------------------------
  // PHASE 3 — Apartment-Notes updaten (komplexe Strings)
  // ---------------------------------------------------------------------------
  console.log('\n🚀 Phase 3: Apartment-Notes für komplexe Strings');
  let notesOk = 0;
  for (const upd of notesUpdates) {
    const apartment_id = aptIdByCode.get(upd.apartment_code);
    if (!apartment_id) {
      console.warn(`   ⚠️  ${upd.apartment_code} nicht gefunden, skip`);
      continue;
    }
    const { error } = await supabase
      .from('apartments')
      .update({ notes: upd.notes })
      .eq('id', apartment_id);
    if (error) {
      console.error(`   ❌ ${upd.apartment_code}: ${error.message}`);
    } else {
      notesOk++;
    }
  }
  console.log(`   ✅ ${notesOk}/${notesUpdates.length} Apartments mit Notes-Update`);

  // ---------------------------------------------------------------------------
  // Final-Check
  // ---------------------------------------------------------------------------
  const [{ count: tFinal }, { count: bFinal }] = await Promise.all([
    supabase.from('tenants').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }),
  ]);

  console.log('\n📦 Final:');
  console.log(`   tenants:  ${tFinal} Zeilen`);
  console.log(`   bookings: ${bFinal} Zeilen`);
}

main().catch((err) => {
  console.error('❌ Unerwarteter Fehler:', err);
  process.exit(1);
});
