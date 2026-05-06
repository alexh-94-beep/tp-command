'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import {
  syncAllChannels,
  syncSingleApartment,
  type SyncResult,
} from '@/services/channels/sync-ical';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

export async function triggerFullSync(): Promise<{ ok: boolean; results: SyncResult[]; error?: string }> {
  await requireRole(['admin', 'office']);
  try {
    const results = await syncAllChannels();
    revalidatePath('/bookings');
    revalidatePath('/calendar');
    revalidatePath('/dashboard');
    return { ok: true, results };
  } catch (e) {
    return { ok: false, results: [], error: (e as Error).message };
  }
}

export async function triggerApartmentSync(apartmentId: string) {
  await requireRole(['admin', 'office']);
  try {
    const results = await syncSingleApartment(apartmentId);
    revalidatePath(`/apartments/${apartmentId}`);
    revalidatePath('/calendar');
    return { ok: true, results };
  } catch (e) {
    return { ok: false, results: [], error: (e as Error).message };
  }
}

const linkSchema = z.object({
  apartment_id: z.string().uuid(),
  channel_code: z.string().min(1),
  ical_pull_url: z.string().url().or(z.literal('')),
  external_id: z.string().optional(),
});

export async function saveChannelLink(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin', 'office']);
  const parsed = linkSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: 'Ungültige Eingabe' };

  const supabase = createSupabaseServerClient();
  const { data: channel } = await supabase
    .from('channels')
    .select('id')
    .eq('code', parsed.data.channel_code)
    .maybeSingle();
  if (!channel) return { ok: false, error: `Channel ${parsed.data.channel_code} nicht gefunden` };

  // Wenn URL leer, Link löschen
  if (!parsed.data.ical_pull_url) {
    await supabase
      .from('apartment_channel_links')
      .delete()
      .eq('apartment_id', parsed.data.apartment_id)
      .eq('channel_id', channel.id);
    revalidatePath('/settings/channels');
    return { ok: true };
  }

  const { error } = await supabase.from('apartment_channel_links').upsert(
    {
      apartment_id: parsed.data.apartment_id,
      channel_id: channel.id,
      ical_pull_url: parsed.data.ical_pull_url,
      external_id: parsed.data.external_id ?? null,
    },
    { onConflict: 'apartment_id,channel_id' },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/channels');
  return { ok: true };
}
