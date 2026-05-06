'use server';

import { requireRole } from '@/lib/auth/session';
import { getApplications, getListings, rawFetch } from '@/lib/channels/flatfox/client';

export async function flatfoxConnectionTest() {
  await requireRole(['admin']);
  const [apps, listings] = await Promise.all([getApplications(), getListings()]);
  return {
    applications: apps,
    listings,
    env: {
      hasToken: Boolean(process.env.FLATFOX_API_TOKEN),
      apiUrl: process.env.FLATFOX_API_URL ?? 'https://flatfox.ch/api/v1',
    },
  };
}

export async function flatfoxRawFetch(path: string) {
  await requireRole(['admin']);
  return rawFetch(path);
}
