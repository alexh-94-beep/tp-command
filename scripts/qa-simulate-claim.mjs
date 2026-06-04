// Simuliert einen Office-User B, der parallel zu User A einen Claim auf
// eine pending_reservation macht. Wir nutzen das exakt gleiche conditional
// UPDATE wie die Server-Action — wenn 1 Row zurueck kommt, gewinnt B.
// Usage: node scripts/qa-simulate-claim.mjs <external_uid>
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

const uid = process.argv[2];
if (!uid) {
  console.error('usage: qa-simulate-claim.mjs <external_uid>');
  process.exit(1);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const r = await fetch(
  `${url}/rest/v1/pending_reservations?external_uid=eq.${uid}&status=eq.pending&select=id`,
  {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'assigned', assigned_at: new Date().toISOString() }),
  },
);
const body = await r.json();
if (body?.length === 1) {
  console.log(`User-B claim erfolgreich: ${body[0].id}`);
} else {
  console.log(`User-B claim leer (kein pending mehr): ${JSON.stringify(body)}`);
}
