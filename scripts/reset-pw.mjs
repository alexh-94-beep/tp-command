// Dev-only utility to reset a Supabase auth user's password via the REST Admin API.
// Uses fetch directly to avoid pulling in the realtime client (which needs `ws`
// on Node < 22).
// Usage: pnpm exec node scripts/reset-pw.mjs <email> <new-password>
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

const [email, newPassword] = process.argv.slice(2);
if (!email || !newPassword) {
  console.error('usage: reset-pw.mjs <email> <new-password>');
  process.exit(1);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

const listRes = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
if (!listRes.ok) {
  console.error('list failed', listRes.status, await listRes.text());
  process.exit(1);
}
const list = await listRes.json();
const u = list.users?.find((x) => x.email?.toLowerCase() === email.toLowerCase());
if (!u) {
  console.error('user not found:', email);
  process.exit(1);
}

const updRes = await fetch(`${url}/auth/v1/admin/users/${u.id}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ password: newPassword, email_confirm: true }),
});
if (!updRes.ok) {
  console.error('update failed', updRes.status, await updRes.text());
  process.exit(1);
}
const upd = await updRes.json();
console.log('password reset OK for', upd.email);
