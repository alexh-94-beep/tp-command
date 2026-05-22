import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/auth/rbac';

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
}

/** Holt den aktuellen User inkl. Rolle aus public.users. Null wenn nicht eingeloggt. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .eq('id', user.id)
    .single();

  if (error || !profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
  };
}

/** Wirft den User auf /login, wenn nicht eingeloggt. Liefert sonst den User. */
export async function requireUser(): Promise<AppUser> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .eq('id', authUser.id)
    .single();

  if (!profile) {
    // Auth-Cookie gültig, aber Profil fehlt (z. B. nach db reset).
    // Sauber ausloggen statt Endlos-Redirect.
    redirect('/auth/no-profile');
  }

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
  };
}

/** Wie requireUser, aber zusätzlich mit Rollen-Check. */
export async function requireRole(roles: AppRole[]): Promise<AppUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect('/dashboard');
  }
  return user;
}
