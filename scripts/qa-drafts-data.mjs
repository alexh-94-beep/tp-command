// Dev-only: Testdaten fuer die 4 Auto-Draft-Trigger.
// Usage: node scripts/qa-drafts-data.mjs
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

const aps = await rest(
  `apartments?select=id,number&number=in.(C.0401,C.0402,C.0403,C.0404)&order=number`,
);
if (aps.length < 4) {
  console.error('brauchen C.0401..C.0404, gefunden:', aps.map((a) => a.number));
  process.exit(1);
}

// 1 Tenant mit Email — Pflicht fuer Mail-Drafts
let tenant;
const existing = await rest(
  `tenants?select=id&email=eq.qa-drafts@tp-command.local`,
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
        last_name: 'Drafts',
        email: 'qa-drafts@tp-command.local',
        source: 'direct',
      }),
    })
  )[0];
}

async function ensureBooking(refKey, apt, start, end, rentalType, status = 'planned') {
  const ex = await rest(`bookings?select=id&external_reference=eq.${refKey}`);
  if (ex[0]) return ex[0];
  return (
    await rest(`bookings?select=id`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        apartment_id: apt.id,
        tenant_id: tenant.id,
        rental_type: rentalType,
        external_reference: refKey,
        start_date: start,
        end_date: end,
        rent_amount: 1500,
        deposit_amount: 0,
        contract_status: 'signed',
        status,
      }),
    })
  )[0];
}

// (A) Welcome-Trigger: Einzug in 7 Tagen
const bA = await ensureBooking('qa:draft:welcome', aps[0], addDays(today, 7), addDays(today, 37), 'short_term');
console.log('  + Booking welcome-trigger', aps[0].number);

// (B) Checkin-Trigger: Einzug morgen
const bB = await ensureBooking('qa:draft:checkin', aps[1], addDays(today, 1), addDays(today, 30), 'short_term');
console.log('  + Booking checkin-trigger', aps[1].number);

// (C) Checkout-Trigger: Auszug in 3 Tagen
const bC = await ensureBooking('qa:draft:checkout', aps[2], addDays(today, -10), addDays(today, 3), 'short_term', 'active');
console.log('  + Booking checkout-trigger', aps[2].number);

// (D) Reminder-Trigger: Buchung mit ueberfaelliger Zahlung
const bD = await ensureBooking('qa:draft:reminder', aps[3], addDays(today, -30), addDays(today, 60), 'long_term', 'active');
console.log('  + Booking reminder-trigger', aps[3].number);
// Payment ueberfaellig
const exP = await rest(
  `payments?select=id&booking_id=eq.${bD.id}&type=eq.rent&due_date=eq.${addDays(today, -10)}`,
);
if (!exP.length) {
  await rest(`payments?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      booking_id: bD.id,
      type: 'rent',
      amount: 1500,
      due_date: addDays(today, -10),
      status: 'overdue',
      method: 'bank_transfer',
      reference: 'INV-QA-001',
    }),
  });
  console.log('  + Overdue payment');
}

console.log('done — Buchungs-IDs:', { A: bA.id, B: bB.id, C: bC.id, D: bD.id });
