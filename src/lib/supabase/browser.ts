import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/db';

/**
 * Supabase-Client für Client Components.
 * Anon-Key ist OK – RLS übernimmt die Absicherung. Nur für den Auth-Flow
 * verwenden, alle übrigen Mutationen laufen über Server-Actions.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
