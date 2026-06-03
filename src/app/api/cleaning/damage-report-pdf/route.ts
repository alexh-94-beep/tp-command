import { NextResponse, type NextRequest } from 'next/server';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const MARGIN = 40;
const CONTENT_WIDTH = A4_WIDTH - 2 * MARGIN;

const PHOTO_MAX_HEIGHT = 180;

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('de-CH', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Bricht Text in Zeilen anhand max. Breite. Newlines + Leerzeichen, harter Wortbruch als Fallback. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);
  for (const para of paragraphs) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        current = trial;
      } else {
        if (current) lines.push(current);
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            const trialChunk = chunk + ch;
            if (font.widthOfTextAtSize(trialChunk, size) <= maxWidth) {
              chunk = trialChunk;
            } else {
              lines.push(chunk);
              chunk = ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

interface PageState {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  rangeLabel: string;
}

function pageHeader(state: PageState, page: PDFPage) {
  page.drawText('Schadensreport · Cityus', {
    x: MARGIN,
    y: A4_HEIGHT - MARGIN + 5,
    size: 9,
    font: state.fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(state.rangeLabel, {
    x:
      A4_WIDTH -
      MARGIN -
      state.fontRegular.widthOfTextAtSize(state.rangeLabel, 9),
    y: A4_HEIGHT - MARGIN + 5,
    size: 9,
    font: state.fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  });
}

function newPage(state: PageState): PageState {
  const page = state.doc.addPage([A4_WIDTH, A4_HEIGHT]);
  pageHeader(state, page);
  return { ...state, page, y: A4_HEIGHT - MARGIN - 4 };
}

function ensureSpace(state: PageState, neededHeight: number): PageState {
  if (state.y - neededHeight < MARGIN) return newPage(state);
  return state;
}

function drawLine(state: PageState, color = rgb(0.85, 0.85, 0.85)): PageState {
  state.page.drawLine({
    start: { x: MARGIN, y: state.y },
    end: { x: A4_WIDTH - MARGIN, y: state.y },
    thickness: 0.5,
    color,
  });
  return { ...state, y: state.y - 8 };
}

function drawHeading(state: PageState, text: string, size = 14): PageState {
  const s = ensureSpace(state, size + 6);
  s.page.drawText(text, {
    x: MARGIN,
    y: s.y - size,
    size,
    font: s.fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  return { ...s, y: s.y - size - 6 };
}

function drawLabelValue(state: PageState, label: string, value: string): PageState {
  const lines = wrapText(value, state.fontRegular, 10, CONTENT_WIDTH - 90);
  const s = ensureSpace(state, lines.length * 12 + 4);
  s.page.drawText(label, {
    x: MARGIN,
    y: s.y - 10,
    size: 10,
    font: s.fontBold,
    color: rgb(0.3, 0.3, 0.3),
  });
  let lineY = s.y - 10;
  for (const line of lines) {
    s.page.drawText(line, {
      x: MARGIN + 90,
      y: lineY,
      size: 10,
      font: s.fontRegular,
      color: rgb(0.1, 0.1, 0.1),
    });
    lineY -= 12;
  }
  return { ...s, y: lineY - 2 };
}

function drawWrappedText(state: PageState, text: string, size = 10): PageState {
  const lines = wrapText(text, state.fontRegular, size, CONTENT_WIDTH);
  const s = ensureSpace(state, lines.length * (size + 2) + 2);
  let lineY = s.y - size;
  for (const line of lines) {
    s.page.drawText(line, {
      x: MARGIN,
      y: lineY,
      size,
      font: s.fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });
    lineY -= size + 2;
  }
  return { ...s, y: lineY - 2 };
}

interface PhotoEmbed {
  image: PDFImage;
  width: number;
  height: number;
}

async function drawPhotos(state: PageState, photos: PhotoEmbed[]): Promise<PageState> {
  if (photos.length === 0) return state;
  let s = state;
  const colWidth = (CONTENT_WIDTH - 12) / 2;
  for (let i = 0; i < photos.length; i += 2) {
    const left = photos[i];
    const right = photos[i + 1];
    const scaleOf = (p: PhotoEmbed) =>
      Math.min(colWidth / p.width, PHOTO_MAX_HEIGHT / p.height, 1);
    const lScale = scaleOf(left);
    const lW = left.width * lScale;
    const lH = left.height * lScale;
    const rScale = right ? scaleOf(right) : 0;
    const rW = right ? right.width * rScale : 0;
    const rH = right ? right.height * rScale : 0;
    const rowHeight = Math.max(lH, rH) + 6;
    s = ensureSpace(s, rowHeight);
    s.page.drawImage(left.image, { x: MARGIN, y: s.y - lH, width: lW, height: lH });
    if (right)
      s.page.drawImage(right.image, {
        x: MARGIN + colWidth + 12,
        y: s.y - rH,
        width: rW,
        height: rH,
      });
    s = { ...s, y: s.y - rowHeight };
  }
  return s;
}

export async function GET(request: NextRequest) {
  await requireRole(['admin', 'office']);

  const url = new URL(request.url);
  const fromIso = url.searchParams.get('from') ?? new Date().toISOString().slice(0, 10);
  const toIso = url.searchParams.get('to') ?? fromIso;
  const includePhotos = (url.searchParams.get('photos') ?? '1') !== '0';

  const supabase = await createSupabaseServerClient();

  const { data: tasks, error } = await supabase
    .from('cleaning_tasks')
    .select(
      'id, scheduled_date, scheduled_time, type, status, damage_found, damage_description, inspection_summary, notes, apartment:apartments(number, building, floor, type), stay:subleasing_stays(guest_name, check_in_date, check_out_date, external_reference)',
    )
    .eq('type', 'inspection')
    .eq('damage_found', true)
    .gte('scheduled_date', fromIso)
    .lte('scheduled_date', toIso)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = tasks ?? [];

  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Fotos pro Task laden + einbetten
  const realPhotos = new Map<string, PhotoEmbed[]>();
  if (includePhotos && items.length > 0) {
    const ids = items.map((t) => t.id);
    const { data: photoRows } = await supabase
      .from('cleaning_photos')
      .select('id, cleaning_task_id, storage_path')
      .in('cleaning_task_id', ids)
      .order('created_at', { ascending: true });

    for (const row of photoRows ?? []) {
      try {
        const { data: signed } = await supabase.storage
          .from('cleaning-photos')
          .createSignedUrl(row.storage_path, 60 * 5);
        if (!signed?.signedUrl) continue;
        const res = await fetch(signed.signedUrl);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());

        const path = row.storage_path.toLowerCase();
        const isPng = path.endsWith('.png');
        let img: PDFImage;
        try {
          img = isPng ? await doc.embedPng(buf) : await doc.embedJpg(buf);
        } catch {
          try {
            img = isPng ? await doc.embedJpg(buf) : await doc.embedPng(buf);
          } catch {
            continue;
          }
        }
        const list = realPhotos.get(row.cleaning_task_id) ?? [];
        if (list.length < 6) {
          list.push({ image: img, width: img.width, height: img.height });
        }
        realPhotos.set(row.cleaning_task_id, list);
      } catch {
        // skip
      }
    }
  }

  const rangeLabel =
    fromIso === toIso ? dateLabel(fromIso) : `${dateLabel(fromIso)} – ${dateLabel(toIso)}`;

  let state: PageState = {
    doc,
    page: doc.addPage([A4_WIDTH, A4_HEIGHT]),
    y: A4_HEIGHT - MARGIN,
    fontRegular,
    fontBold,
    rangeLabel,
  };
  pageHeader(state, state.page);

  state = drawHeading(state, 'Schadensreport', 22);
  state = drawWrappedText(
    state,
    `Zeitraum: ${rangeLabel}\nAnzahl Schadensfälle: ${items.length}`,
    10,
  );
  state = drawLine(state);

  if (items.length === 0) {
    state = drawWrappedText(
      state,
      'Im gewählten Zeitraum wurden keine Schäden gemeldet.',
      11,
    );
  } else {
    let idx = 0;
    for (const t of items) {
      idx += 1;
      const apt = t.apartment;
      const stay = t.stay;

      if (idx > 1) {
        state = ensureSpace(state, 24);
        state = drawLine(state, rgb(0.92, 0.92, 0.92));
      }

      const aptLabel = apt?.number ?? '–';
      const aptInfo = [
        apt?.building && `Haus ${apt.building}`,
        apt?.floor !== undefined && apt?.floor !== null ? `${apt.floor}. Stock` : null,
        apt?.type,
      ]
        .filter(Boolean)
        .join(' · ');

      state = drawHeading(state, `${idx}. Wohnung ${aptLabel}`, 13);
      if (aptInfo) state = drawLabelValue(state, 'Apartment', aptInfo);
      state = drawLabelValue(state, 'Inspektion', dateLabel(t.scheduled_date));
      if (stay?.guest_name) state = drawLabelValue(state, 'Gast', stay.guest_name);
      if (stay?.check_in_date && stay?.check_out_date) {
        state = drawLabelValue(
          state,
          'Aufenthalt',
          `${dateLabel(stay.check_in_date)} – ${dateLabel(stay.check_out_date)}`,
        );
      }
      if (stay?.external_reference)
        state = drawLabelValue(state, 'Referenz', stay.external_reference);

      if (t.damage_description) {
        state = ensureSpace(state, 18);
        state.page.drawText('Schadensbeschreibung', {
          x: MARGIN,
          y: state.y - 10,
          size: 10,
          font: fontBold,
          color: rgb(0.65, 0.1, 0.1),
        });
        state = { ...state, y: state.y - 14 };
        state = drawWrappedText(state, t.damage_description, 10);
      }
      if (t.inspection_summary) {
        state = ensureSpace(state, 18);
        state.page.drawText('Inspektions-Notiz', {
          x: MARGIN,
          y: state.y - 10,
          size: 10,
          font: fontBold,
          color: rgb(0.3, 0.3, 0.3),
        });
        state = { ...state, y: state.y - 14 };
        state = drawWrappedText(state, t.inspection_summary, 10);
      }

      const photos = realPhotos.get(t.id) ?? [];
      if (photos.length > 0) {
        state = ensureSpace(state, 18);
        state.page.drawText(`Fotos (${photos.length})`, {
          x: MARGIN,
          y: state.y - 10,
          size: 10,
          font: fontBold,
          color: rgb(0.3, 0.3, 0.3),
        });
        state = { ...state, y: state.y - 14 };
        state = await drawPhotos(state, photos);
      }
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Seite ${i + 1} von ${pages.length}`;
    p.drawText(label, {
      x: A4_WIDTH - MARGIN - fontRegular.widthOfTextAtSize(label, 9),
      y: 20,
      size: 9,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
    p.drawText(`Erstellt am ${new Date().toLocaleDateString('de-CH')}`, {
      x: MARGIN,
      y: 20,
      size: 9,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  });

  const bytes = await doc.save();
  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="schadensreport-${fromIso}_${toIso}.pdf"`,
    },
  });
}
