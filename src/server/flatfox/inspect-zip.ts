'use server';

import JSZip from 'jszip';
import { requireRole } from '@/lib/auth/session';

const BASE_URL = process.env.FLATFOX_API_URL ?? 'https://flatfox.ch/api/v1';
const TOKEN = process.env.FLATFOX_API_TOKEN;

export interface ZipFileInfo {
  name: string;
  size: number;
  type: 'json' | 'pdf' | 'image' | 'text' | 'binary';
  preview?: string;
}

export interface InspectZipResult {
  ok: boolean;
  status: number;
  error?: string;
  url?: string;
  size?: number;
  files?: ZipFileInfo[];
}

export async function inspectFlatfoxZip(path: string): Promise<InspectZipResult> {
  await requireRole(['admin']);
  if (!TOKEN) return { ok: false, status: 0, error: 'FLATFOX_API_TOKEN fehlt' };

  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, status: res.status, url, error: `HTTP ${res.status}` };
    }
    const arrayBuffer = await res.arrayBuffer();
    const totalSize = arrayBuffer.byteLength;

    const zip = await JSZip.loadAsync(arrayBuffer);
    const files: ZipFileInfo[] = [];

    for (const name of Object.keys(zip.files)) {
      const f = zip.files[name];
      if (f.dir) continue;
      const buf = await f.async('uint8array');
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      let type: ZipFileInfo['type'] = 'binary';
      if (ext === 'json') type = 'json';
      else if (ext === 'pdf') type = 'pdf';
      else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) type = 'image';
      else if (['txt', 'csv', 'xml', 'html'].includes(ext)) type = 'text';

      let preview: string | undefined;
      if (type === 'json' || type === 'text') {
        const text = new TextDecoder().decode(buf);
        if (type === 'json') {
          try {
            preview = JSON.stringify(JSON.parse(text), null, 2);
          } catch {
            preview = text.slice(0, 5000);
          }
        } else {
          preview = text.slice(0, 5000);
        }
      }

      files.push({ name, size: buf.byteLength, type, preview });
    }

    return { ok: true, status: res.status, url, size: totalSize, files };
  } catch (e) {
    return { ok: false, status: 0, url, error: (e as Error).message };
  }
}
