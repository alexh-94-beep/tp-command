import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase-Client für Client Components.
 * Anon-Key ist OK – RLS übernimmt die Absicherung.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
