/**
 * Extrahiert Text aus einer PDF mit Layout-Information (X/Y-Koordinaten der Text-Items),
 * gruppiert sie in Zeilen und sortiert pro Zeile nach X. So bleibt die visuelle
 * Struktur erhalten – wichtig für tabellenartige PDFs mit mehreren Spalten.
 *
 * Liefert pro Seite eine Liste von Zeilen, jede Zeile besteht aus Text-Tokens
 * mit ihrer X-Position. Der Caller kann anhand der X-Positionen Spalten erkennen.
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface LayoutToken {
  text: string;
  x: number;
  y: number;
  width: number;
}

export interface LayoutLine {
  y: number;
  tokens: LayoutToken[];
}

export interface LayoutPage {
  pageNumber: number;
  width: number;
  height: number;
  lines: LayoutLine[];
}

const Y_TOLERANCE = 3;

export async function extractPdfLayout(buffer: Buffer | Uint8Array | ArrayBuffer): Promise<LayoutPage[]> {
  // pdfjs-dist erwartet eine "echte" Uint8Array – Node Buffer wird teilweise abgelehnt.
  // Wir kopieren in eine frische Uint8Array, damit es überall funktioniert.
  let data: Uint8Array;
  if (buffer instanceof ArrayBuffer) {
    data = new Uint8Array(buffer);
  } else {
    // Buffer oder Uint8Array → byte-für-byte in neue Uint8Array
    const src = buffer as Uint8Array;
    data = new Uint8Array(src.byteLength);
    data.set(src);
  }
  const doc = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;

  const pages: LayoutPage[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const tokens: LayoutToken[] = [];
    for (const item of content.items as Array<{ str: string; transform: number[]; width?: number }>) {
      const text = item.str;
      if (!text) continue;
      // PDF-Koordinaten: Y wächst nach oben; wir invertieren auf Top-Down.
      const x = item.transform[4];
      const y = viewport.height - item.transform[5];
      const width = item.width ?? text.length * 5;
      if (text.trim()) {
        tokens.push({ text, x, y, width });
      }
    }

    // Sortiere nach Y (top-down), dann X (left-right)
    tokens.sort((a, b) => a.y - b.y || a.x - b.x);

    // Gruppiere zu Zeilen (Y-Toleranz)
    const lines: LayoutLine[] = [];
    let current: LayoutLine | null = null;
    for (const t of tokens) {
      if (!current || Math.abs(t.y - current.y) > Y_TOLERANCE) {
        current = { y: t.y, tokens: [] };
        lines.push(current);
      }
      current.tokens.push(t);
    }

    // Sortiere Tokens innerhalb jeder Zeile nochmal nach X
    for (const l of lines) l.tokens.sort((a, b) => a.x - b.x);

    pages.push({
      pageNumber: pageNum,
      width: viewport.width,
      height: viewport.height,
      lines,
    });
  }

  await doc.destroy();
  return pages;
}

/**
 * Splittet eine Zeile anhand grosser X-Lücken in „Zellen". Eine Lücke gilt als
 * Spaltentrenner, wenn der Abstand zwischen Token-Ende und nächstem Token-Anfang
 * einen Schwellwert übersteigt (Default 25 PDF-Punkte).
 */
export function lineCells(line: LayoutLine, gapThreshold = 25): { x: number; text: string }[] {
  const cells: { x: number; text: string }[] = [];
  let currentText = '';
  let currentX = 0;
  let lastEnd = -Infinity;

  for (const t of line.tokens) {
    const gap = t.x - lastEnd;
    if (gap > gapThreshold && currentText) {
      cells.push({ x: currentX, text: currentText.trim() });
      currentText = '';
    }
    if (!currentText) currentX = t.x;
    currentText += (currentText ? ' ' : '') + t.text;
    lastEnd = t.x + t.width;
  }
  if (currentText) cells.push({ x: currentX, text: currentText.trim() });

  return cells;
}

/** Liefert alle Zeilen aller Seiten als flachen Array, mit Seitennummer */
export function flattenLines(pages: LayoutPage[]): Array<{ page: number; line: LayoutLine }> {
  return pages.flatMap((p) => p.lines.map((l) => ({ page: p.pageNumber, line: l })));
}
