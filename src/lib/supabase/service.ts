import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';

/**
 * Service-Role-Client. Umgeht RLS komplett – darf NUR in:
 *   - Cron-Routen (/api/cron/*)
 *   - Webhook-Routen (/api/webhooks/*)
 * verwendet werden. Niemals im Browser oder regulären Server Components.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Supabase Service-Role-Konfiguration fehlt.');
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
