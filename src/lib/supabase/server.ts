import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Supabase-Client für Server Components und Server Actions.
 * Liest die Session aus den Next.js-Cookies. Schreibt nur, wenn aufgerufen
 * aus einem Kontext mit veränderbaren Cookies (z. B. Server Action / Route Handler).
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Components dürfen Cookies nicht setzen – Middleware übernimmt.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            /* siehe oben */
          }
        },
      },
    },
  );
}
