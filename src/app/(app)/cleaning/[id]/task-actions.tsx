'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  appendCleaningNote,
  updateCleaningStatus,
  uploadCleaningPhoto,
} from '@/server/cleaning/actions';
import { assignTaskToStaff } from '@/server/cleaning/staff';
import type { AppRole } from '@/lib/auth/rbac';
import type { CleaningStatus } from '@/types/db';

interface Props {
  taskId: string;
  status: CleaningStatus;
  currentAssignee: string | null;
  userRole: AppRole;
  cleaners: { id: string; full_name: string }[];
}

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';

export default function CleaningTaskActions({
  taskId,
  status,
  currentAssignee,
  userRole,
  cleaners,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canManage = userRole === 'admin' || userRole === 'office';
  const canChangeStatus = canManage || userRole === 'cleaning';

  function setStatus(next: CleaningStatus) {
    setError(null);
    startTransition(async () => {
      const r = await updateCleaningStatus(taskId, next);
      if (!r.ok) setError(r.error ?? 'Fehler');
      router.refresh();
    });
  }

  function assign(value: string) {
    startTransition(async () => {
      await assignTaskToStaff(taskId, value || null);
      router.refresh();
    });
  }

  function addNote() {
    if (!noteText.trim()) return;
    startTransition(async () => {
      await appendCleaningNote(taskId, noteText.trim());
      setNoteText('');
      router.refresh();
    });
  }

  function uploadPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    startTransition(async () => {
      const buf = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buf).reduce((acc, b) => acc + String.fromCharCode(b), ''),
      );
      const r = await uploadCleaningPhoto({
        taskId,
        filename: file.name,
        base64,
        mimeType: file.type || 'image/jpeg',
      });
      if (!r.ok) setError(r.error ?? 'Upload-Fehler');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktionen</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Status-Buttons */}
        {canChangeStatus && (
          <div className="flex flex-wrap gap-2">
            {status === 'open' && (
              <Button onClick={() => setStatus('in_progress')} disabled={pending}>
                Mit Reinigung beginnen
              </Button>
            )}
            {status === 'in_progress' && (
              <Button onClick={() => setStatus('done')} disabled={pending}>
                Reinigung erledigt
              </Button>
            )}
            {canManage && status === 'done' && (
              <Button onClick={() => setStatus('quality_checked')} disabled={pending}>
                Qualität geprüft & freigegeben
              </Button>
            )}
            {status !== 'open' && canManage && (
              <Button variant="secondary" onClick={() => setStatus('open')} disabled={pending}>
                Wieder öffnen
              </Button>
            )}
          </div>
        )}

        {/* Zuweisung */}
        {canManage && (
          <div>
            <label className="block text-sm font-medium text-slate-700">Reinigerin zuweisen</label>
            <select
              className={`${inputCls} mt-1 max-w-md`}
              value={currentAssignee ?? ''}
              onChange={(e) => assign(e.target.value)}
              disabled={pending}
            >
              <option value="">– Niemand –</option>
              {cleaners.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Foto-Upload */}
        <div>
          <label className="block text-sm font-medium text-slate-700">Foto hinzufügen</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={uploadPhoto}
            disabled={pending}
            className="mt-1 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
        </div>

        {/* Notiz hinzufügen */}
        <div>
          <label className="block text-sm font-medium text-slate-700">Notiz hinzufügen</label>
          <textarea
            className={`${inputCls} mt-1 min-h-[80px]`}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="z. B. Kühlschrank gereinigt, Bett bezogen…"
          />
          <Button onClick={addNote} disabled={pending || !noteText.trim()} className="mt-2">
            Notiz speichern
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
