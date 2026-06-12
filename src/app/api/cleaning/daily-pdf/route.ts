import { NextResponse, type NextRequest } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import type { AccessMethod, CleaningType } from '@/types/aliases';

export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<CleaningType, string> = {
  checkout: 'Auszugs-Reinigung',
  pre_checkin: 'Pre-Checkin',
  intermediate: 'Wiederkehrend',
  weekly_clean: 'Wöchentlich',
  weekly_clean_linen: 'Wöchentlich + Bett',
  inspection: 'Inspektion',
  special: 'Spezial',
  deep_clean: 'Endreinigung',
};

const ACCESS_LABELS: Record<AccessMethod, string> = {
  key_available: 'Schlüssel bei uns',
  customer_at_home: 'Kunde zuhause',
  key_at_reception: 'Schlüssel beim Empfang',
  key_box: 'Schlüsselbox',
  other: 'Anders',
};

const APARTMENT_TYPE_LABEL: Record<string, string> = {
  junior: 'Junior · 50m²',
  senior: 'Senior · 70m²',
  studio: 'Studio',
  suite: 'Suite',
};

interface CategoryInfo {
  label: string;
  /** rgb-3-Tuple fuer Badge-Hintergrund */
  bg: [number, number, number];
  fg: [number, number, number];
}

function deriveCategory(t: {
  source?: string | null;
  external_apartment?: { contact_name?: string | null } | null;
  booking?: {
    rental_type?: 'long_term' | 'short_term' | 'booking';
    tenant?: { first_name?: string | null; last_name?: string | null } | null;
  } | null;
  stay?: { guest_name?: string | null } | null;
}): CategoryInfo {
  if (t.source === 'cityus') {
    return {
      label: 'Bella (Cityus)' + (t.stay?.guest_name ? ` · ${t.stay.guest_name}` : ''),
      bg: [0.83, 0.91, 0.97],
      fg: [0.05, 0.27, 0.55],
    };
  }
  if (t.external_apartment) {
    return {
      label: `Eigentümer: ${t.external_apartment.contact_name ?? 'extern'}`,
      bg: [1.0, 0.95, 0.86],
      fg: [0.6, 0.36, 0.05],
    };
  }
  if (t.booking?.rental_type === 'booking') {
    return {
      label: 'Booking.com',
      bg: [1.0, 0.93, 0.93],
      fg: [0.71, 0.18, 0.18],
    };
  }
  if (t.booking?.tenant) {
    const name = [t.booking.tenant.first_name, t.booking.tenant.last_name]
      .filter(Boolean)
      .join(' ');
    return {
      label: `Mieter: ${name || '–'}`,
      bg: [0.86, 0.96, 0.89],
      fg: [0.07, 0.45, 0.27],
    };
  }
  return {
    label: 'Office-Auftrag',
    bg: [0.93, 0.94, 0.95],
    fg: [0.3, 0.36, 0.42],
  };
}

export async function GET(request: NextRequest) {
  await requireRole(['admin', 'office']);

  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const staffId = url.searchParams.get('staff_id');
  const days = Math.max(1, Math.min(14, Number(url.searchParams.get('days') ?? '1')));

  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + days - 1);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);

  const supabase = await createSupabaseServerClient();

  let staffNames: { id: string; full_name: string }[] = [];
  if (staffId) {
    const { data } = await supabase
      .from('cleaning_staff')
      .select('id, full_name')
      .eq('id', staffId)
      .single();
    if (data) staffNames = [data];
  } else {
    const { data } = await supabase
      .from('cleaning_staff')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name');
    staffNames = data ?? [];
  }

  const { data: tasks } = await supabase
    .from('cleaning_tasks')
    .select(
      'id, scheduled_date, scheduled_time, type, priority, status, notes, access_method, access_notes, staff_id, linen_change, time_flexible, time_constraint_note, source, apartment:apartments(number, building, type, keybox_default_code, keybox_default_location), external_apartment:external_apartments(label, address, contact_name, contact_phone), stay:subleasing_stays(guest_name, check_in_time, keybox_code), booking:bookings(rental_type, tenant:tenants!bookings_tenant_id_fkey(first_name, last_name))',
    )
    .gte('scheduled_date', startIso)
    .lte('scheduled_date', endIso)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true, nullsFirst: false });

  const all = tasks ?? [];

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 36;
  const pageWidth = 595; // A4
  const pageHeight = 842;

  for (const staff of staffNames) {
    const myTasks = all.filter((t) => t.staff_id === staff.id);
    if (myTasks.length === 0 && !staffId) continue;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    page.drawText('Reinigungsplan', {
      x: margin,
      y,
      size: 18,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 22;
    page.drawText(staff.full_name, {
      x: margin,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 18;
    const dateLabel =
      days === 1
        ? new Date(startIso).toLocaleDateString('de-CH', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : `${new Date(startIso).toLocaleDateString('de-CH')} – ${new Date(endIso).toLocaleDateString('de-CH')}`;
    page.drawText(dateLabel, {
      x: margin,
      y,
      size: 11,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 24;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 16;

    if (myTasks.length === 0) {
      page.drawText('Keine Aufträge für heute.', {
        x: margin,
        y,
        size: 11,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5),
      });
      continue;
    }

    // currentPage trackt das aktive Seitenobjekt; "page" oben bleibt der Start
    let currentPage = page;
    for (const t of myTasks) {
      // Auftrag braucht mind ~110pt Platz (Wohnungs-Nr-Headline + 4-5 Sub-Zeilen)
      if (y < 130) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        currentPage.drawText(`${staff.full_name} – Fortsetzung`, {
          x: margin,
          y,
          size: 11,
          font: fontBold,
        });
        y -= 22;
      }

      const target = t.apartment?.number ?? t.external_apartment?.label ?? '–';
      const apartmentTypeLabel = t.apartment?.type
        ? (APARTMENT_TYPE_LABEL[t.apartment.type] ?? t.apartment.type)
        : null;
      const time = t.scheduled_time ?? '–';
      const type = TYPE_LABELS[t.type];
      const datePrefix =
        days > 1
          ? new Date(t.scheduled_date).toLocaleDateString('de-CH', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
            }) + '  '
          : '';

      const category = deriveCategory(t);

      // ── Wohnungs-Nr GROSS als Headline ───────────────────────────────
      currentPage.drawText(target, {
        x: margin,
        y: y - 2,
        size: 26,
        font: fontBold,
        color: rgb(0.05, 0.05, 0.05),
      });
      // Wohnungs-Typ rechts neben Wohnungs-Nr
      if (apartmentTypeLabel) {
        currentPage.drawText(apartmentTypeLabel, {
          x: margin + 150,
          y: y - 2,
          size: 11,
          font: fontRegular,
          color: rgb(0.45, 0.45, 0.45),
        });
      }
      // Bettwäsche-Marker oben rechts
      if (t.linen_change) {
        currentPage.drawText('Bettwäsche wechseln', {
          x: pageWidth - margin - 130,
          y,
          size: 11,
          font: fontBold,
          color: rgb(0.05, 0.36, 0.65),
        });
      }
      y -= 26;

      // ── Zeit + Typ ──────────────────────────────────────────────────
      currentPage.drawText(`${datePrefix}${time}  ·  ${type}`, {
        x: margin,
        y,
        size: 12,
        font: fontBold,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= 16;

      // ── Kategorie/Source-Badge ──────────────────────────────────────
      const catTextWidth = fontRegular.widthOfTextAtSize(category.label, 10);
      currentPage.drawRectangle({
        x: margin,
        y: y - 3,
        width: catTextWidth + 12,
        height: 14,
        color: rgb(category.bg[0], category.bg[1], category.bg[2]),
      });
      currentPage.drawText(category.label, {
        x: margin + 6,
        y: y,
        size: 10,
        font: fontRegular,
        color: rgb(category.fg[0], category.fg[1], category.fg[2]),
      });
      y -= 18;

      // ── Sub-Infos ───────────────────────────────────────────────────
      const sub: string[] = [];
      if (t.external_apartment?.address) sub.push(t.external_apartment.address);
      if (t.external_apartment?.contact_phone) {
        sub.push(`Tel: ${t.external_apartment.contact_phone}`);
      }
      if (t.access_method) {
        sub.push(
          `Zutritt: ${ACCESS_LABELS[t.access_method] ?? t.access_method}${t.access_notes ? ` (${t.access_notes})` : ''}`,
        );
      }
      const keybox = t.stay?.keybox_code ?? t.apartment?.keybox_default_code;
      if (keybox) {
        sub.push(
          `Schlüsselbox: ${keybox}${t.apartment?.keybox_default_location ? ` (${t.apartment.keybox_default_location})` : ''}`,
        );
      }
      if (!t.time_flexible && t.time_constraint_note) {
        sub.push(`Zeitvorgabe: ${t.time_constraint_note}`);
      } else if (!t.time_flexible) {
        sub.push('Zeitvorgabe: fix (siehe Termin)');
      }
      if (t.notes) sub.push(t.notes.replace(/\n/g, ' · '));

      for (const line of sub) {
        const text = line.length > 100 ? line.slice(0, 97) + '…' : line;
        currentPage.drawText(text, {
          x: margin + 12,
          y,
          size: 10,
          font: fontRegular,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= 12;
      }
      // Trennlinie
      y -= 6;
      currentPage.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 0.3,
        color: rgb(0.85, 0.85, 0.85),
      });
      y -= 12;
    }
  }

  const bytes = await pdfDoc.save();
  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="reinigungsplan-${date}${staffId ? '-individuell' : ''}.pdf"`,
    },
  });
}
