'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';

/* -------------------------------------------------- *
 *  Schema – wird vom Form auf Server-Seite validiert. *
 * -------------------------------------------------- */
const apartmentSchema = z.object({
  id: z.string().uuid(),
  building: z.string().min(1, 'Pflicht'),
  type: z.enum(['junior', 'senior', 'suite', 'studio']),
  size_sqm: z.coerce.number().nullable(),
  floor: z.coerce.number().int().nullable(),
  orientation: z.string().nullable(),
  status: z.enum([
    'available',
    'occupied',
    'terminated',
    'contract_pending',
    'booking_active',
    'maintenance',
    'blocked',
  ]),
  ownership: z.enum(['own', 'sold_managed', 'sold_external']),
  allowed_rental_types: z
    .array(z.enum(['long_term', 'short_term', 'booking']))
    .min(1, 'Mindestens eine Vermietungsart'),
  standard_rent: z.coerce.number().nonnegative(),
  short_term_flat_rate: z.coerce.number().nonnegative().nullable(),
  has_parking: z.coerce.boolean(),
  parking_fee: z.coerce.number().nonnegative().nullable(),
  booking_priority: z.coerce.number().int().min(0).max(100),
  cleaning_buffer_hours: z.coerce.number().int().min(0).max(48),
  furnishing_completion: z.coerce.number().min(0).max(1),
  name_tag_status: z.enum(['pending', 'ordered', 'installed']),
  external_link_3d: z.string().url().or(z.literal('')).nullable(),
  sale_price: z.coerce.number().nonnegative().nullable(),
  notes: z.string().nullable(),
});

export interface UpdateResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function updateApartment(formData: FormData): Promise<UpdateResult> {
  await requireRole(['admin', 'office']);

  // FormData → object, mit Nullables und Multi-Selects sauber behandelt
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  raw.allowed_rental_types = formData.getAll('allowed_rental_types');
  raw.has_parking = formData.has('has_parking');

  // Leere Strings → null für nullable Felder
  for (const key of [
    'size_sqm',
    'floor',
    'orientation',
    'short_term_flat_rate',
    'parking_fee',
    'external_link_3d',
    'sale_price',
    'notes',
  ]) {
    if (raw[key] === '') raw[key] = null;
  }

  const parsed = apartmentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Bitte Eingaben prüfen.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { id, ...patch } = parsed.data;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from('apartments').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/apartments');
  revalidatePath(`/apartments/${id}`);
  revalidatePath('/dashboard');
  redirect(`/apartments/${id}`);
}
