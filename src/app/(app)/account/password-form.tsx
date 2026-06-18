'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';

const inputCls =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function PasswordChangeForm() {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen haben.');
      return;
    }
    if (next !== confirm) {
      setError('Passwörter stimmen nicht überein.');
      return;
    }
    setStatus('sending');
    const supabase = createSupabaseBrowserClient();
    const { error: updErr } = await supabase.auth.updateUser({
      password: next,
    });
    if (updErr) {
      setError(updErr.message);
      setStatus('idle');
      return;
    }
    setStatus('ok');
    setNext('');
    setConfirm('');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Neues Passwort
          <input
            type="password"
            required
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputCls}
            minLength={8}
          />
        </label>
        <p className="mt-1 text-xs text-slate-500">Mindestens 8 Zeichen.</p>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Wiederholen
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
          minLength={8}
        />
      </label>

      <div className="flex items-center justify-between">
        <Button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Speichere …' : 'Passwort ändern'}
        </Button>
        {status === 'ok' && (
          <span className="text-sm text-emerald-700">
            ✓ Passwort wurde aktualisiert.
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </form>
  );
}
