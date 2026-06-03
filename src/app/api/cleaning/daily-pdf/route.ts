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
      'id, scheduled_date, scheduled_time, type, priority, status, notes, access_method, access_notes, staff_id, apartment:apartments(number, building, keybox_default_code, keybox_default_location), external_apartment:external_apartments(label, address, contact_name, contact_phone), stay:subleasing_stays(guest_name, check_in_time, keybox_code)',
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
      if (y < 100) {
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

      currentPage.drawText(`${datePrefix}${time}  ${target}  ·  ${type}`, {
        x: margin,
        y,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      y -= 14;

      const sub: string[] = [];
      if (t.external_apartment?.address) sub.push(t.external_apartment.address);
      if (t.external_apartment?.contact_name || t.external_apartment?.contact_phone) {
        sub.push(
          `Kontakt: ${[t.external_apartment.contact_name, t.external_apartment.contact_phone].filter(Boolean).join(' · ')}`,
        );
      }
      if (t.stay?.guest_name) sub.push(`Gast: ${t.stay.guest_name}`);
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
      y -= 8;
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
