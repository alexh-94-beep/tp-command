// Concurrency-QA: prueft, ob parallele Operationen mehrerer Office-User
// zu Datenkorruption fuehren koennen. Testet die drei DB-Konstrukte, auf
// denen die Server-Actions aufbauen:
//   1. Conditional UPDATE  (pending_reservations: status='pending'-Claim)
//   2. EXCLUDE-Constraint  (bookings: keine ueberlappenden Zeitraeume pro Wohnung)
//   3. UNIQUE-Constraint   (pending_reservations: (channel_id, external_uid))
//
// Jeder Test feuert N parallele HTTP-Requests gegen Cloud-Dev und prueft, dass
// genau EINER gewinnt. Wenn die Zahlen nicht stimmen, ist die Plattform unter
// echter Mehr-User-Last unsicher.
//
// Usage: node scripts/qa-concurrency.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const baseHeaders = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

async function rest(path, opts = {}) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { ...baseHeaders, ...(opts.headers ?? {}) },
  });
  const txt = await r.text();
  return { ok: r.ok, status: r.status, body: txt ? JSON.parse(txt) : null };
}

function header(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 70 - title.length))}`);
}

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.log(`  ✗ ${msg}`); process.exitCode = 1; }

// ─── Setup ──────────────────────────────────────────────────────────────
header('Setup');

// Apartment fuer Booking aktivieren
const aps = (
  await rest(`apartments?select=id,number&number=in.(C.0201)&limit=1`)
).body;
if (!aps?.length) {
  console.error('C.0201 nicht gefunden — aborting');
  process.exit(1);
}
const apartment = aps[0];
await rest(`apartments?id=eq.${apartment.id}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ allowed_rental_types: ['booking'], booking_priority: 90 }),
});
pass(`Apartment ${apartment.number} fuer Booking aktiviert`);

// Booking-Channel-ID holen
const ch = (await rest(`channels?select=id&code=eq.booking_com`)).body[0];
pass(`Channel booking_com: ${ch.id}`);

// Tenant fuer Booking-Inserts
let tenantId;
const existingT = (
  await rest(`tenants?select=id&email=eq.qa-conc@tp-command.local`)
).body[0];
if (existingT) {
  tenantId = existingT.id;
} else {
  const res = await rest(
    `tenants?select=id`,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_kind: 'guest',
        first_name: 'QA',
        last_name: 'Concurrency',
        email: 'qa-conc@tp-command.local',
        source: 'booking_com',
      }),
    },
  );
  tenantId = res.body[0].id;
}
pass(`Tenant: ${tenantId}`);

// ─── Test 1: Conditional UPDATE auf pending_reservations ─────────────────
header('Test 1: Race auf pending_reservations.status (claim)');

// Pending-Reservation anlegen
const pres = await rest(`pending_reservations?select=id`, {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({
    channel_id: ch.id,
    external_uid: `CONC-CLAIM-${Date.now()}`,
    start_date: '2026-09-01',
    end_date: '2026-09-05',
    summary: 'Race-Test Claim',
    status: 'pending',
  }),
});
const pendingId = pres.body[0].id;
pass(`Pending-Reservation angelegt: ${pendingId}`);

const N = 20;
const claimAttempts = Array.from({ length: N }, () =>
  rest(
    `pending_reservations?id=eq.${pendingId}&status=eq.pending&select=id`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'assigned', assigned_at: new Date().toISOString() }),
    },
  ),
);
const claimResults = await Promise.all(claimAttempts);
const winners = claimResults.filter((r) => r.ok && r.body?.length === 1).length;
const empties = claimResults.filter((r) => r.ok && r.body?.length === 0).length;
const errors = claimResults.filter((r) => !r.ok).length;
console.log(`  ${N} parallele Claims → winners=${winners}, empty=${empties}, errors=${errors}`);
if (winners === 1 && empties === N - 1 && errors === 0) {
  pass('Genau 1 Gewinner — conditional UPDATE serialisiert korrekt');
} else {
  fail(`ERWARTET 1 winner / ${N - 1} empty / 0 errors`);
}

// Cleanup
await rest(`pending_reservations?id=eq.${pendingId}`, {
  method: 'DELETE',
  headers: { Prefer: 'return=minimal' },
});

// ─── Test 2: EXCLUDE-Constraint auf bookings (Overlap) ────────────────────
header('Test 2: Race auf bookings (EXCLUDE-Constraint)');

const M = 10;
const start = '2026-09-10';
const end = '2026-09-15';
const overlapAttempts = Array.from({ length: M }, (_, i) =>
  rest(`bookings?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      apartment_id: apartment.id,
      tenant_id: tenantId,
      channel_id: ch.id,
      rental_type: 'booking',
      external_reference: `conc-race-${Date.now()}-${i}`,
      start_date: start,
      end_date: end,
      rent_amount: 100,
      deposit_amount: 0,
      contract_status: 'signed',
      status: 'planned',
      notes: 'Race-Test Overlap',
    }),
  }),
);
const overlapResults = await Promise.all(overlapAttempts);
const inserted = overlapResults.filter((r) => r.ok && r.body?.length === 1);
const rejected = overlapResults.filter(
  (r) => !r.ok && (r.body?.code === '23P01' || r.body?.message?.includes('overlap')),
);
const otherErrors = overlapResults.filter(
  (r) => !r.ok && r.body?.code !== '23P01' && !r.body?.message?.includes('overlap'),
);
console.log(
  `  ${M} parallele Booking-Inserts (gleicher Zeitraum) → inserted=${inserted.length}, exclude_violations=${rejected.length}, other_errors=${otherErrors.length}`,
);
if (inserted.length === 1 && rejected.length === M - 1 && otherErrors.length === 0) {
  pass('Genau 1 Booking eingefuegt — EXCLUDE-Constraint greift');
} else {
  fail(
    `ERWARTET 1 inserted / ${M - 1} rejected / 0 other_errors. Sample-Error: ${JSON.stringify(otherErrors[0]?.body ?? rejected[0]?.body)}`,
  );
}

// Cleanup
if (inserted.length) {
  for (const r of inserted) {
    await rest(`bookings?id=eq.${r.body[0].id}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }
}

// ─── Test 3: UNIQUE-Constraint auf pending_reservations.external_uid ─────
header('Test 3: Race auf pending_reservations.external_uid (UNIQUE)');

const uid = `CONC-UID-${Date.now()}`;
const K = 8;
const uniqueAttempts = Array.from({ length: K }, () =>
  rest(`pending_reservations?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      channel_id: ch.id,
      external_uid: uid,
      start_date: '2026-10-01',
      end_date: '2026-10-05',
      status: 'pending',
    }),
  }),
);
const uniqueResults = await Promise.all(uniqueAttempts);
const uIns = uniqueResults.filter((r) => r.ok && r.body?.length === 1);
const uDup = uniqueResults.filter(
  (r) => !r.ok && r.body?.code === '23505',
);
const uOther = uniqueResults.filter(
  (r) => !r.ok && r.body?.code !== '23505',
);
console.log(
  `  ${K} parallele Pending-Inserts mit gleicher UID → inserted=${uIns.length}, unique_violations=${uDup.length}, other_errors=${uOther.length}`,
);
if (uIns.length === 1 && uDup.length === K - 1 && uOther.length === 0) {
  pass('Genau 1 Pending angelegt — UNIQUE-Constraint greift');
} else {
  fail(`ERWARTET 1 inserted / ${K - 1} duplicates / 0 other_errors`);
}

// Cleanup
for (const r of uIns) {
  await rest(`pending_reservations?id=eq.${r.body[0].id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

// ─── Test 4: Read-Race (zwei User lesen + listen parallel) ────────────────
header('Test 4: Read-Konkurrenz (kein Lock-Deadlock)');

const readers = await Promise.all([
  rest(`apartments?select=id,number&limit=10`),
  rest(`bookings?select=id&limit=10`),
  rest(`pending_reservations?select=id&limit=10`),
  rest(`cleaning_tasks?select=id&limit=10`),
  rest(`tenants?select=id&limit=10`),
  rest(`apartments?select=id,number&limit=10`),
  rest(`bookings?select=id&limit=10`),
  rest(`pending_reservations?select=id&limit=10`),
]);
const readOk = readers.filter((r) => r.ok).length;
if (readOk === readers.length) {
  pass(`Alle ${readers.length} parallelen Reads erfolgreich`);
} else {
  fail(`${readers.length - readOk} Reads fehlgeschlagen`);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────
header('Cleanup');
await rest(`apartments?id=eq.${apartment.id}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ allowed_rental_types: ['long_term'], booking_priority: 0 }),
});
pass(`Apartment ${apartment.number} zurueckgesetzt`);

// Tenant lassen wir stehen (qa-conc@), kann mehrfach genutzt werden.

console.log('\n' + (process.exitCode ? '❌ EINER ODER MEHRERE TESTS FEHLGESCHLAGEN' : '✅ ALLE CONCURRENCY-TESTS GRUEN'));
