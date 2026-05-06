'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { de } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';
import { cn } from '@/lib/cn';

/**
 * Datums-Input mit zwei Eingabewegen:
 *   - Tippen im Format TT.MM.JJJJ
 *   - Klick auf Kalender-Icon → Popover mit react-day-picker
 *
 * Externer Wert ist immer ISO YYYY-MM-DD (oder ''), damit das gut zur DB passt.
 */
interface DateInputProps {
  name: string;
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  className?: string;
  id?: string;
}

function isoToDe(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}.${m}.${y}`;
}

function deToIso(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = yy.length === 2 ? `20${yy}` : yy;
  const yearN = Number(year);
  const monthN = Number(mm);
  const dayN = Number(dd);
  if (yearN < 1900 || yearN > 2100) return null;
  if (monthN < 1 || monthN > 12) return null;
  if (dayN < 1 || dayN > 31) return null;
  return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function isoToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function DateInput({ name, value, onChange, required, className, id }: DateInputProps) {
  const [text, setText] = useState(isoToDe(value));
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Externen Wert mit Anzeige synchronisieren
  useEffect(() => {
    setText(isoToDe(value));
  }, [value]);

  // Klick außerhalb schließt das Popover
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  function commitText(raw: string) {
    const parsed = deToIso(raw);
    if (parsed === null) {
      setError(true);
      return;
    }
    setError(false);
    if (parsed !== value) onChange(parsed);
  }

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(false);
        }}
        onBlur={(e) => commitText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitText((e.target as HTMLInputElement).value);
          }
        }}
        required={required}
        placeholder="TT.MM.JJJJ"
        className={cn(
          'block w-full rounded-md border bg-white px-3 py-2 pr-10 text-sm shadow-sm focus:outline-none focus:ring-1',
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
            : 'border-slate-300 focus:border-slate-900 focus:ring-slate-900',
        )}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        tabIndex={-1}
        aria-label="Kalender öffnen"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <CalendarIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <DayPicker
            mode="single"
            locale={de}
            weekStartsOn={1}
            selected={isoToDate(value)}
            defaultMonth={isoToDate(value) ?? new Date()}
            onSelect={(d) => {
              if (d) onChange(dateToIso(d));
              setOpen(false);
            }}
          />
        </div>
      )}

      {/* Verstecktes Form-Feld mit ISO-Wert für FormData */}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
