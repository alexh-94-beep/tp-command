// Dev-only: enable rental_type='booking' on a few apartments for Phase 6 QA.
// Usage: node scripts/qa-enable-booking.mjs [count] [reset]
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

const count = parseInt(process.argv[2] ?? '3', 10);
const reset = process.argv[3] === 'reset';

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

async function rest(path, opts = {}) {
  const r = await fetch(`${url}/rest/v1/${path}`, { ...opts, headers: { ...headers, ...(opts.headers ?? {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

if (reset) {
  const rows = await rest(`apartments?select=id,number&allowed_rental_types=cs.{booking}&order=number`);
  console.log('Resetting', rows.length, 'apartments');
  for (const a of rows) {
    await rest(`apartments?id=eq.${a.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ allowed_rental_types: ['long_term'], booking_priority: 0 }),
    });
  }
  console.log('done');
  process.exit(0);
}

// Pick first N apartments, prefer Studios/1-Zi für Booking-Pool
const rows = await rest(
  `apartments?select=id,number,type&ownership=neq.sold_external&order=number&limit=${count}`,
);
console.log('Enabling booking on', rows.length, 'apartments');
for (let i = 0; i < rows.length; i++) {
  const a = rows[i];
  // Mix: erste = nur booking (Pool-Default), zweite = booking + long_term, dritte = booking + short_term
  const allowed =
    i === 0 ? ['booking'] : i === 1 ? ['long_term', 'booking'] : ['short_term', 'booking'];
  const prio = i === 0 ? 90 : i === 1 ? 50 : 70;
  await rest(`apartments?id=eq.${a.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ allowed_rental_types: allowed, booking_priority: prio }),
  });
  console.log(`  ${a.number} (${a.type}) → allowed=${allowed.join('+')} prio=${prio}`);
}
console.log('done');
