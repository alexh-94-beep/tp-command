import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-Klassen mergen (clsx + tailwind-merge gegen Konflikte). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
