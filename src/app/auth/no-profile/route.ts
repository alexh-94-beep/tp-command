import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Wird angesteuert, wenn ein User in auth.users existiert, aber kein
 * Eintrag in public.users vorhanden ist (z. B. nach `supabase db reset`).
 * Loggt den User sauber aus und schickt ihn zurück zur Login-Seite mit
 * sprechender Fehlermeldung.
 */
export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login?error=no_profile', request.url));
}
