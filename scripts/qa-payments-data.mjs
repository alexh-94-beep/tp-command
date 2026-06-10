// Dev-only: legt eine Test-Buchung mit auto-erzeugten Plan-Zahlungen an
// + eine ueberfaellige Zahlung fuer Dashboard/Listen-QA. Idempotent.
//
// Usage: node scripts/qa-payments-data.mjs
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
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

async function rest(path, opts = {}) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers ?? {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

const today = new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
console.log('Heute:', today);

// 2 Apartments für die Test-Buchungen
const aps = await rest(
  `apartments?select=id,number&number=in.(C.0301,C.0302)&order=number`,
);
if (aps.length < 2) {
  console.error('brauchen C.0301 und C.0302 — fehlt:', aps.map((a) => a.number));
  process.exit(1);
}

// 1 Gast-Tenant fuer alle
let tenant;
const existing = await rest(
  `tenants?select=id&email=eq.qa-payments@tp-command.local`,
);
if (existing[0]) {
  tenant = existing[0];
} else {
  tenant = (
    await rest(`tenants?select=id`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_kind: 'tenant',
        first_name: 'QA',
        last_name: 'Payments',
        email: 'qa-payments@tp-command.local',
        source: 'direct',
      }),
    })
  )[0];
}

async function bookingExists(ref) {
  const r = await rest(`bookings?select=id&external_reference=eq.${ref}`);
  return r[0];
}

// (A) Langzeit-Buchung — Cron / Auto-Anlage erzeugt Depot + Erst-Miete
let bookingA = await bookingExists('qa:pay:long');
if (!bookingA) {
  bookingA = (
    await rest(`bookings?select=id`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        apartment_id: aps[0].id,
        tenant_id: tenant.id,
        rental_type: 'long_term',
        external_reference: 'qa:pay:long',
        start_date: addDays(today, 30),
        end_date: '9999-12-31',
        rent_amount: 1500,
        deposit_amount: 3000,
        contract_status: 'signed',
        status: 'planned',
      }),
    })
  )[0];
  console.log('  + Booking long_term', aps[0].number);
}

// (B) Booking-Pool-Style
let bookingB = await bookingExists('pool:QA-PAY-002');
if (!bookingB) {
  bookingB = (
    await rest(`bookings?select=id`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        apartment_id: aps[1].id,
        tenant_id: tenant.id,
        rental_type: 'booking',
        external_reference: 'pool:QA-PAY-002',
        start_date: addDays(today, -10),
        end_date: addDays(today, -2),
        rent_amount: 800,
        deposit_amount: 0,
        contract_status: 'signed',
        status: 'active',
      }),
    })
  )[0];
  console.log('  + Booking booking-pool', aps[1].number);
}

// Plan-Zahlungen erzeugen wir manuell (Insert-Trigger erfolgt sonst nur
// via Server-Action; per Skript direkt das gleiche Format).
async function ensurePayment(bookingId, type, amount, dueDate, status = 'pending') {
  const existing = await rest(
    `payments?select=id&booking_id=eq.${bookingId}&type=eq.${type}&due_date=eq.${dueDate}`,
  );
  if (existing.length) return;
  await rest(`payments?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      booking_id: bookingId,
      type,
      amount,
      due_date: dueDate,
      status,
      method: 'bank_transfer',
    }),
  });
  console.log(`  + Payment ${type} ${amount} due ${dueDate} status=${status}`);
}

// Long-Term: Depot heute, Erst-Miete in 16 Tagen (Einzug+30, -14)
await ensurePayment(bookingA.id, 'deposit', 3000, today);
await ensurePayment(bookingA.id, 'first_rent', 1500, addDays(today, 16));

// Eine bewusst ueberfaellige Miete
await ensurePayment(bookingA.id, 'rent', 1500, addDays(today, -5), 'overdue');

// Booking-Pool: Payout 14 Tage nach Auszug
await ensurePayment(bookingB.id, 'booking_payout', 800, addDays(today, 12));

console.log('done');
