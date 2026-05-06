import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware className-Merger für UI-Komponenten. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
