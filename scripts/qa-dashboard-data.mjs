// Dev-only: legt Testdaten an, damit das Dashboard mit nicht-null-Zaehlern
// gerendert werden kann. Idempotent: laeuft mehrfach ohne Duplikate.
// Usage: node scripts/qa-dashboard-data.mjs
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
console.log('Heute:', today);

const addDays = (iso, n) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// 4 Apartments für die Mix-Cases
const aps = await rest(
  `apartments?select=id,number&number=in.(C.0201,C.0202,C.0203,C.0204)&order=number`,
);
if (aps.length < 4) {
  console.error('brauchen mind. 4 Apartments — fehlt:', aps.map((a) => a.number));
  process.exit(1);
}

const ch = (await rest(`channels?select=id&code=eq.booking_com`))[0];

// 1 Gast-Tenant fuer alles
let tenant;
const existing = await rest(
  `tenants?select=id&email=eq.qa-dashboard@tp-command.local`,
);
if (existing[0]) {
  tenant = existing[0];
} else {
  tenant = (
    await rest(`tenants?select=id`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_kind: 'guest',
        first_name: 'QA',
        last_name: 'Dashboard',
        email: 'qa-dashboard@tp-command.local',
        source: 'booking_com',
      }),
    })
  )[0];
}

// Helper: existiert booking schon?
async function bookingExists(refKey) {
  const r = await rest(`bookings?select=id&external_reference=eq.${refKey}`);
  return r.length > 0;
}

// (A) Buchung mit start_date = heute (Heute Einzug)
if (!(await bookingExists('qa:dash:in-today'))) {
  await rest(`bookings?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      apartment_id: aps[0].id,
      tenant_id: tenant.id,
      channel_id: ch.id,
      rental_type: 'short_term',
      external_reference: 'qa:dash:in-today',
      start_date: today,
      end_date: addDays(today, 3),
      rent_amount: 500,
      deposit_amount: 0,
      contract_status: 'signed',
      status: 'planned',
    }),
  });
  console.log('  + Booking (Heute Einzug)', aps[0].number);
}

// (B) Buchung mit end_date = heute (Heute Auszug)
if (!(await bookingExists('qa:dash:out-today'))) {
  await rest(`bookings?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      apartment_id: aps[1].id,
      tenant_id: tenant.id,
      channel_id: ch.id,
      rental_type: 'short_term',
      external_reference: 'qa:dash:out-today',
      start_date: addDays(today, -5),
      end_date: today,
      rent_amount: 500,
      deposit_amount: 0,
      contract_status: 'signed',
      status: 'active',
    }),
  });
  console.log('  + Booking (Heute Auszug)', aps[1].number);
}

// (C) Buchung naechste Woche (Einzug)
if (!(await bookingExists('qa:dash:in-next7'))) {
  await rest(`bookings?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      apartment_id: aps[2].id,
      tenant_id: tenant.id,
      channel_id: ch.id,
      rental_type: 'short_term',
      external_reference: 'qa:dash:in-next7',
      start_date: addDays(today, 3),
      end_date: addDays(today, 7),
      rent_amount: 500,
      deposit_amount: 0,
      contract_status: 'signed',
      status: 'planned',
    }),
  });
  console.log('  + Booking (Einzug in 3 Tagen)', aps[2].number);
}

// (D) Aktuelle Belegung (start vor heute, end nach heute) zaehlt als "occupied"
if (!(await bookingExists('qa:dash:occupied'))) {
  await rest(`bookings?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      apartment_id: aps[3].id,
      tenant_id: tenant.id,
      channel_id: ch.id,
      rental_type: 'short_term',
      external_reference: 'qa:dash:occupied',
      start_date: addDays(today, -10),
      end_date: addDays(today, 5),
      rent_amount: 500,
      deposit_amount: 0,
      contract_status: 'signed',
      status: 'active',
    }),
  });
  console.log('  + Booking (aktuell belegt)', aps[3].number);
}

// (E) Pool-Reservation (offen)
const existingPool = await rest(
  `pending_reservations?select=id&external_uid=eq.QA-DASH-POOL`,
);
if (!existingPool.length) {
  await rest(`pending_reservations?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      channel_id: ch.id,
      external_uid: 'QA-DASH-POOL',
      start_date: addDays(today, 14),
      end_date: addDays(today, 18),
      summary: 'QA Dashboard Test',
      status: 'pending',
    }),
  });
  console.log('  + Pool-Reservation QA-DASH-POOL');
}

// (F) Überfällige Reinigung (geplant vor heute, status='open')
const existingClean = await rest(
  `cleaning_tasks?select=id&notes=eq.qa:dash:overdue`,
);
if (!existingClean.length) {
  await rest(`cleaning_tasks?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      apartment_id: aps[0].id,
      scheduled_date: addDays(today, -2),
      type: 'checkout',
      status: 'open',
      priority: 'high',
      estimated_duration_minutes: 90,
      notes: 'qa:dash:overdue',
    }),
  });
  console.log('  + Cleaning (überfällig)');
}

// (G) Reinigung heute (status='open')
if (
  !(await rest(`cleaning_tasks?select=id&notes=eq.qa:dash:today`)).length
) {
  await rest(`cleaning_tasks?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      apartment_id: aps[1].id,
      scheduled_date: today,
      type: 'checkout',
      status: 'open',
      priority: 'normal',
      estimated_duration_minutes: 60,
      notes: 'qa:dash:today',
    }),
  });
  console.log('  + Cleaning (heute)');
}

console.log('done');
