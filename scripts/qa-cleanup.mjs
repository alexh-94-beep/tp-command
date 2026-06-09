// Cleanup für Phase-6-Browser-QA: löscht test-bookings/pending/tenants
// und setzt die in qa-enable-booking.mjs angelegten Apartment-Konfigs zurück.
// Usage: node scripts/qa-cleanup.mjs
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

// Test-Pending-Reservationen (TEST-QA-*, QA-DASH-*, RACE-*)
const pendings = await rest(
  `pending_reservations?select=id,external_uid,assigned_booking_id&or=(external_uid.like.TEST-QA-*,external_uid.like.QA-DASH-*,external_uid.like.RACE-*)`,
);
console.log('Pending:', pendings.length);
for (const p of pendings) {
  if (p.assigned_booking_id) {
    // erst Booking + Tenant + zugehörige Tasks/Cleanings löschen
    const booking = (
      await rest(`bookings?id=eq.${p.assigned_booking_id}&select=id,tenant_id`)
    )[0];
    if (booking) {
      const tasks = await rest(`booking_tasks?booking_id=eq.${booking.id}&select=id`);
      for (const t of tasks)
        await rest(`booking_tasks?id=eq.${t.id}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
      const cleaning_tasks = await rest(`cleaning_tasks?booking_id=eq.${booking.id}&select=id`);
      for (const c of cleaning_tasks)
        await rest(`cleaning_tasks?id=eq.${c.id}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
      // pending muss zuerst entkoppelt werden (FK)
      await rest(`pending_reservations?id=eq.${p.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ assigned_booking_id: null }),
      });
      await rest(`bookings?id=eq.${booking.id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      if (booking.tenant_id)
        await rest(`tenants?id=eq.${booking.tenant_id}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
    }
  }
  await rest(`pending_reservations?id=eq.${p.id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  console.log('  removed pending', p.external_uid);
}

// Test-Bookings ohne Pending-Anker (qa:dash:*)
const orphanBookings = await rest(
  `bookings?select=id,tenant_id,external_reference&external_reference=like.qa:dash:*`,
);
for (const b of orphanBookings) {
  const tasks = await rest(`booking_tasks?booking_id=eq.${b.id}&select=id`);
  for (const t of tasks)
    await rest(`booking_tasks?id=eq.${t.id}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  const cleans = await rest(`cleaning_tasks?booking_id=eq.${b.id}&select=id`);
  for (const c of cleans)
    await rest(`cleaning_tasks?id=eq.${c.id}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  await rest(`bookings?id=eq.${b.id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  console.log('  removed booking', b.external_reference);
}

// Verwaiste Cleaning-Tasks (notes=qa:dash:*)
const orphanCleans = await rest(
  `cleaning_tasks?select=id,notes&notes=like.qa:dash:*`,
);
for (const c of orphanCleans) {
  await rest(`cleaning_tasks?id=eq.${c.id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  console.log('  removed cleaning', c.notes);
}

// QA-Tenants
for (const email of ['qa-dashboard@tp-command.local']) {
  const ts = await rest(`tenants?select=id&email=eq.${email}`);
  for (const t of ts) {
    await rest(`tenants?id=eq.${t.id}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    console.log('  removed tenant', email);
  }
}

// Apartments zurücksetzen (alle mit allowed_rental_types containing booking, die
// in qa-enable-booking.mjs angefasst wurden — C.0201, C.0202, C.0203)
const aps = await rest(
  `apartments?select=id,number&number=in.(C.0201,C.0202,C.0203)`,
);
for (const a of aps) {
  await rest(`apartments?id=eq.${a.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ allowed_rental_types: ['long_term'], booking_priority: 0 }),
  });
  console.log('  reset apartment', a.number);
}
console.log('cleanup done');
