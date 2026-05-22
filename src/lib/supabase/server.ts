import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/db';

/**
 * Supabase-Client für Server Components und Server Actions.
 * Next 15+/16: `cookies()` ist async — daher ist diese Funktion async.
 * Liest die Session aus den Next.js-Cookies.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components dürfen Cookies nicht setzen –
            // die Middleware übernimmt den Session-Refresh.
          }
        },
      },
    },
  );
}
