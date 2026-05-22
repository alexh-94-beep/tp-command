import LoginForm from './login-form';

export const metadata = { title: 'Login' };

const errorMessages: Record<string, string> = {
  no_profile:
    'Dein Konto existiert in Auth, aber es gibt noch kein App-Profil. Bitte beim Admin melden.',
  auth: 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const errorMsg = error ? errorMessages[error] : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">TP-Command</h1>
        <p className="mt-1 text-sm text-slate-500">
          Melde dich mit deiner Arbeits-E-Mail und deinem Passwort an.
        </p>

        {errorMsg && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {errorMsg}
          </p>
        )}

        <div className="mt-6">
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
