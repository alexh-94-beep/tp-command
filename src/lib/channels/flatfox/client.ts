/**
 * Flatfox-API-Client.
 * Auth: Authorization: Bearer <token>
 * Endpoints im Singular: /application/, /listing/, /dossier/, ...
 *
 * Wird vom Server (server actions, API routes) genutzt — niemals im Browser
 * (Token wuerde geleakt).
 */

const BASE_URL = process.env.FLATFOX_API_URL ?? 'https://flatfox.ch/api/v1';
const TOKEN = process.env.FLATFOX_API_TOKEN;

export interface FlatfoxResponse<T> {
  ok: boolean;
  status: number;
  url: string;
  data?: T;
  error?: string;
}

export interface FlatfoxApplication {
  pk: number;
  flat: number;
  text: string | null;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string;
  user: number;
  created: string;
  has_form_data: boolean;
  form_submitted: string | null;
  summary_pdf_url: string | null;
  summary_zip_url: string | null;
  purged: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  is_favorite: boolean;
}

export interface FlatfoxListing {
  pk: number;
  street: string;
  zipcode: number | string;
  city: string;
  ref_property: string | null;
  ref_house: string | null;
  ref_object: string | null;
  rent_gross: number | null;
  surface_living: number | null;
  number_of_rooms: string | null;
  floor: number | null;
  short_title: string | null;
  public_address: string;
  status: string;
}

async function flatfoxFetch<T>(
  path: string,
  init?: { responseType?: 'json' | 'binary' },
): Promise<FlatfoxResponse<T>> {
  if (!TOKEN) {
    return { ok: false, status: 0, url: path, error: 'FLATFOX_API_TOKEN fehlt in .env' };
  }
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept:
          init?.responseType === 'binary' ? 'application/octet-stream' : 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        status: res.status,
        url,
        error: `${res.status}: ${body.slice(0, 500)}`,
      };
    }
    if (init?.responseType === 'binary') {
      const buf = Buffer.from(await res.arrayBuffer());
      return { ok: true, status: res.status, url, data: buf as unknown as T };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, url, data };
  } catch (e) {
    return { ok: false, status: 0, url, error: (e as Error).message };
  }
}

// ── Endpoints ────────────────────────────────────────────────────────

export function getApplications() {
  return flatfoxFetch<FlatfoxApplication[]>('/application/');
}

export function getApplication(pk: number) {
  return flatfoxFetch<FlatfoxApplication>(`/application/${pk}/`);
}

export function getListing(pk: number) {
  return flatfoxFetch<FlatfoxListing>(`/listing/${pk}/`);
}

/** Liste aller Listings — fuer den Connectivity-Test. */
export function getListings() {
  return flatfoxFetch<FlatfoxListing[]>('/listing/');
}

/**
 * Laedt PDF/ZIP herunter. Flatfox antwortet teils mit JSON-Wrapper, in dem
 * der Datei-Inhalt base64-codiert steckt. Wir probieren JSON, fallen sonst
 * auf binary zurueck.
 */
export async function downloadAttachment(
  url: string,
): Promise<FlatfoxResponse<{ filename?: string; mimeType?: string; buffer: Buffer }>> {
  if (!TOKEN) return { ok: false, status: 0, url, error: 'FLATFOX_API_TOKEN fehlt' };
  const fullUrl = url.startsWith('http')
    ? url
    : `${BASE_URL.replace(/\/api\/v1$/, '')}${url}`;
  try {
    const res = await fetch(fullUrl, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        status: res.status,
        url: fullUrl,
        error: `${res.status}: ${body.slice(0, 300)}`,
      };
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = (await res.json()) as Record<string, unknown>;
      const fileField =
        (json.file as string | undefined) ??
        (json.data as string | undefined) ??
        (json.content as string | undefined) ??
        (json.payload as string | undefined);
      const filename =
        (json.file_name as string | undefined) ??
        (json.filename as string | undefined) ??
        (json.name as string | undefined);
      const mimeType =
        (json.content_type as string | undefined) ??
        (json.mime_type as string | undefined) ??
        (json.mimeType as string | undefined);
      if (!fileField) {
        return {
          ok: false,
          status: res.status,
          url: fullUrl,
          error: `Unbekanntes JSON-Format: ${JSON.stringify(json).slice(0, 200)}`,
        };
      }
      const b64 = fileField.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(b64, 'base64');
      return {
        ok: true,
        status: res.status,
        url: fullUrl,
        data: { filename, mimeType, buffer },
      };
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      ok: true,
      status: res.status,
      url: fullUrl,
      data: { buffer, mimeType: contentType || undefined },
    };
  } catch (e) {
    return { ok: false, status: 0, url: fullUrl, error: (e as Error).message };
  }
}

export function rawFetch(path: string) {
  return flatfoxFetch<unknown>(path);
}
