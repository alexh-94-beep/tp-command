/**
 * Parser für Flatfox-Anmeldeformulare (PDF).
 *
 * Wir nutzen pdfjs-dist mit Layout-Information (X/Y-Koordinaten), damit die
 * zwei- bis dreispaltigen Bewerber-Tabellen korrekt erkannt werden.
 *
 * Strategie:
 *  - Pro Zeile zerlegen wir in „Zellen" anhand grosser X-Lücken.
 *  - Erste Zelle ≈ Label, weitere Zellen ≈ Werte (1 pro Bewerber).
 */
import {
  extractPdfLayout,
  lineCells,
  type LayoutPage,
  type LayoutLine,
} from './pdf-layout';
import type {
  CivilStatus,
  EmploymentStatus,
  Gender,
  ResidencePermit,
  TenantSource,
} from '@/types/db';

export interface FlatfoxApplicantSummary {
  full_name: string;
  phone: string | null;
}

export interface FlatfoxApplicantDetail {
  relationship: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  civil_status: CivilStatus | null;
  gender: Gender | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  residence_permit: ResidencePermit | null;
  heimatort: string | null;
  address: string | null;
  previous_landlord: string | null;
  previous_landlord_phone: string | null;
  previous_landlord_email: string | null;
  profession: string | null;
  employer: string | null;
  employment_status: EmploymentStatus | null;
  annual_income: number | null;
  employer_phone: string | null;
  has_debt_collection: boolean | null;
  raw: Record<string, string>;
}

export interface FlatfoxApplication {
  source: TenantSource;
  apartment_reference: string | null;
  apartment_label: string | null;
  rent_gross: number | null;
  desired_move_in: string | null;
  reason_for_move: string | null;
  remarks: string | null;
  adults: number | null;
  children: number | null;
  pets: string | null;
  parking: string | null;
  music_instruments: string | null;
  applicants_summary: FlatfoxApplicantSummary[];
  applicants: FlatfoxApplicantDetail[];
  attachments: string[];
  raw_text: string;
}

/* ------------------------------------------------------------------ *
 *  Mapping-Helfer                                                      *
 * ------------------------------------------------------------------ */

const monthNames: Record<string, number> = {
  januar: 1, februar: 2, märz: 3, marz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7,
  october: 10, december: 12,
};

function parseGermanDate(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  // DD. Monatsname YYYY oder DD Monatsname YYYY
  const m1 = t.match(/^(\d{1,2})\.?\s+([A-Za-zäöüÄÖÜ]+)\s+(\d{4})$/);
  if (m1) {
    const [, dd, mon, yyyy] = m1;
    const month = monthNames[mon.toLowerCase()];
    if (!month) return null;
    return `${yyyy}-${String(month).padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const m2 = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m2) {
    const [, dd, mm, yyyy] = m2;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return null;
}

function mapCivilStatus(v: string | null): CivilStatus | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.includes('ledig')) return 'single';
  if (s.includes('verheiratet')) return 'married';
  if (s.includes('geschieden')) return 'divorced';
  if (s.includes('verwitwet')) return 'widowed';
  if (s.includes('partnerschaft')) return 'partnership';
  if (s.includes('getrennt')) return 'separated';
  return null;
}

function mapGender(v: string | null): Gender | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.startsWith('männ')) return 'male';
  if (s.startsWith('weib')) return 'female';
  if (s.includes('andere')) return 'other';
  return null;
}

function mapPermit(v: string | null): ResidencePermit | null {
  if (!v) return null;
  const m = v.match(/\b([CBLFGNS])\b/);
  if (m) return m[1] as ResidencePermit;
  if (/schweiz|swiss|ch\b/i.test(v)) return 'CH';
  if (/eu\b|eu-/i.test(v)) return 'EU';
  return null;
}

function mapEmployment(v: string | null): EmploymentStatus | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.includes('angestellt')) return 'employed';
  if (s.includes('selbst')) return 'self_employed';
  if (s.includes('pensioniert') || s.includes('rentner')) return 'retired';
  if (s.includes('student') || s.includes('schüler')) return 'student';
  if (s.includes('arbeitslos')) return 'unemployed';
  return null;
}

function mapDebt(v: string | null): boolean | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.startsWith('nein')) return false;
  if (s.startsWith('ja')) return true;
  return null;
}

function mapMoney(v: string | null): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[^\d.,]/g, '').replace(/'/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractApartmentRef(s: string): string | null {
  const m = s.match(/\b(?:TPA\.)?([A-Z])\.(\d{3,4})\b/);
  if (!m) return null;
  return `${m[1]}.${m[2].padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ *
 *  Parser                                                              *
 * ------------------------------------------------------------------ */

export async function parseFlatfoxPdf(buffer: Buffer): Promise<FlatfoxApplication> {
  const pages = await extractPdfLayout(buffer);
  const allText = pages
    .flatMap((p) => p.lines.map((l) => l.tokens.map((t) => t.text).join(' ')))
    .join('\n');

  // -------- Header (Seite 1) --------
  const header = parseHeader(pages[0]);

  // -------- Bewerber-Übersicht (Seite 1) --------
  const applicants_summary = parseApplicantSummary(pages[0]);

  // -------- Bewerber-Detailseiten (Seite 2+) --------
  const detailPages = pages
    .slice(1)
    .filter((p) =>
      p.lines.some((l) => l.tokens[0]?.text.startsWith('Beziehung zum Hauptmieter')),
    );
  const applicantsRaw: FlatfoxApplicantDetail[] = [];
  for (const page of detailPages) {
    applicantsRaw.push(...parseApplicantDetailPage(page));
  }

  // Falls die Detail-Seite weniger Personen liefert als die Übersicht: auffüllen
  while (applicantsRaw.length < applicants_summary.length) {
    const sum = applicants_summary[applicantsRaw.length];
    const parts = sum.full_name.split(/\s+/);
    applicantsRaw.push(emptyApplicant({
      first_name: parts.slice(0, -1).join(' ') || sum.full_name,
      last_name: parts.slice(-1)[0] ?? '',
      phone: sum.phone,
    }));
  }

  return {
    source: 'flatfox',
    apartment_reference: header.apartment_reference,
    apartment_label: header.apartment_label,
    rent_gross: header.rent_gross,
    desired_move_in: header.desired_move_in,
    reason_for_move: header.reason_for_move,
    remarks: header.remarks,
    adults: header.adults,
    children: header.children,
    pets: header.pets,
    parking: header.parking,
    music_instruments: header.music_instruments,
    applicants_summary,
    applicants: applicantsRaw.slice(0, Math.max(applicants_summary.length, applicantsRaw.length)),
    attachments: header.attachments,
    raw_text: allText,
  };
}

function emptyApplicant(seed: Partial<FlatfoxApplicantDetail> = {}): FlatfoxApplicantDetail {
  return {
    relationship: null,
    first_name: '',
    last_name: '',
    date_of_birth: null,
    civil_status: null,
    gender: null,
    email: null,
    phone: null,
    nationality: null,
    residence_permit: null,
    heimatort: null,
    address: null,
    previous_landlord: null,
    previous_landlord_phone: null,
    previous_landlord_email: null,
    profession: null,
    employer: null,
    employment_status: null,
    annual_income: null,
    employer_phone: null,
    has_debt_collection: null,
    raw: {},
    ...seed,
  };
}

/* ------------------------------------------------------------------ *
 *  Header / Übersichtsseite                                            *
 * ------------------------------------------------------------------ */

function parseHeader(page: LayoutPage | undefined) {
  const empty = {
    apartment_reference: null as string | null,
    apartment_label: null as string | null,
    rent_gross: null as number | null,
    desired_move_in: null as string | null,
    reason_for_move: null as string | null,
    remarks: null as string | null,
    adults: null as number | null,
    children: null as number | null,
    pets: null as string | null,
    parking: null as string | null,
    music_instruments: null as string | null,
    attachments: [] as string[],
  };
  if (!page) return empty;

  // Wir lesen jede Zeile als „LabelCell  WertCell" (und ggf. zweites Label/Wert-Paar
  // rechts daneben, weil Flatfox manche Felder zweispaltig anlegt).
  const dict: Record<string, string> = {};
  let lastLabelLeft: string | null = null;
  let lastLabelRight: string | null = null;

  for (const line of page.lines) {
    const cells = lineCells(line, 30);
    if (cells.length === 0) continue;

    // 1) Wenn die Zeile mit einem bekannten Header-Label beginnt, ist sie ein
    //    „Label\tWert"-Pair (links), evtl. plus zweites Label\tWert (rechts).
    const labels = [
      'Bruttomiete', 'Referenz', 'Nebenkosten', 'Etage', 'Nettomiete', 'Zimmer',
      'Fläche', 'Bezugstermin', 'Erwachsene', 'Kinder', 'Musikinstrumente',
      'Parkplatz', 'Haustiere', 'Gew. Bezugstermin', 'Grund für den Umzug',
      'Bemerkung',
    ];
    const isLabel = (s: string) => labels.some((lab) => s === lab || s.startsWith(lab));

    // Erkennen wir Label-Wert-Spalten?
    if (isLabel(cells[0].text) && cells.length >= 2) {
      dict[cells[0].text] = cells[1].text;
      lastLabelLeft = cells[0].text;
      if (cells.length >= 4 && isLabel(cells[2].text)) {
        dict[cells[2].text] = cells[3].text;
        lastLabelRight = cells[2].text;
      } else {
        lastLabelRight = null;
      }
      continue;
    }

    // 2) Manchmal stehen Label und Wert auf VERSCHIEDENEN Zeilen
    if (cells.length === 1 && isLabel(cells[0].text)) {
      lastLabelLeft = cells[0].text;
      lastLabelRight = null;
      continue;
    }
    if (lastLabelLeft && cells.length >= 1 && !isLabel(cells[0].text)) {
      dict[lastLabelLeft] = (dict[lastLabelLeft] ? dict[lastLabelLeft] + ' ' : '') + cells[0].text;
      if (lastLabelRight && cells.length >= 2) {
        dict[lastLabelRight] = (dict[lastLabelRight] ? dict[lastLabelRight] + ' ' : '') + cells[1].text;
      }
    }
  }

  // Wohnungs-Label/Referenz: zweite Zeile auf Seite 1
  empty.apartment_label = page.lines[1]?.tokens.map((t) => t.text).join(' ').trim() ?? null;
  empty.apartment_reference =
    extractApartmentRef(dict['Referenz'] ?? '') ??
    extractApartmentRef(empty.apartment_label ?? '') ??
    extractApartmentRef(page.lines.flatMap((l) => l.tokens.map((t) => t.text)).join(' '));

  empty.rent_gross = mapMoney(dict['Bruttomiete'] ?? null);
  empty.desired_move_in = parseGermanDate(dict['Gew. Bezugstermin'] ?? '');
  empty.reason_for_move = dict['Grund für den Umzug'] ?? null;
  empty.remarks = dict['Bemerkung'] ?? null;
  empty.adults = dict['Erwachsene'] ? Number(dict['Erwachsene']) : null;
  empty.children = dict['Kinder'] ? Number(dict['Kinder']) : null;
  empty.pets = dict['Haustiere'] ?? null;
  empty.parking = dict['Parkplatz'] ?? null;
  empty.music_instruments = dict['Musikinstrumente'] ?? null;

  // Anhänge
  const attachIdx = page.lines.findIndex((l) =>
    l.tokens.map((t) => t.text).join(' ').trim().startsWith('Anhänge'),
  );
  if (attachIdx >= 0) {
    for (let i = attachIdx + 1; i < page.lines.length; i++) {
      const txt = page.lines[i].tokens.map((t) => t.text).join(' ').trim();
      if (!txt) continue;
      if (/^\d{1,2}\.\s+\w+\s+\d{4}/.test(txt)) break; // Footer
      const m = txt.match(/(?:•\s*)?(?:[A-Za-zäöü]+:\s*)?([^\s]\S*\.[a-z]{2,5})/);
      if (m) empty.attachments.push(m[1]);
    }
  }

  return empty;
}

function parseApplicantSummary(page: LayoutPage | undefined): FlatfoxApplicantSummary[] {
  if (!page) return [];
  const out: FlatfoxApplicantSummary[] = [];
  // Bewerber-Übersicht: nach Zeile mit "Bewerber" kommen Name + Telefon abwechselnd
  const idx = page.lines.findIndex((l) =>
    l.tokens.length === 1 && l.tokens[0].text === 'Bewerber',
  );
  if (idx < 0) return out;

  for (let i = idx + 1; i < page.lines.length; i++) {
    const tokens = page.lines[i].tokens;
    if (tokens.length === 0) continue;
    const txt = tokens.map((t) => t.text).join(' ').trim();
    if (/^Erwachsene/.test(txt) || /^Kinder/.test(txt)) break;

    // Pro Zeile können mehrere Personen-Spalten stehen. Wir splitten an grossen X-Lücken.
    const cells = lineCells(page.lines[i], 60);
    for (const c of cells) {
      const t = c.text.trim();
      // Telefon
      if (/^\+?\d[\d\s\-()]{6,}$/.test(t)) {
        if (out.length > 0 && !out[out.length - 1].phone) {
          out[out.length - 1].phone = t;
        } else {
          // Hinzufügen ohne Namen falls Telefon zuerst kommt
          out.push({ full_name: '(unbekannt)', phone: t });
        }
        continue;
      }
      // Name (mind. 2 Wörter)
      if (/^[A-ZÄÖÜ][\wäöüÄÖÜß-]+(?:\s+[A-ZÄÖÜ][\wäöüÄÖÜß-]+)+$/.test(t)) {
        out.push({ full_name: t, phone: null });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  Bewerber-Detailseite                                                *
 * ------------------------------------------------------------------ */

function parseApplicantDetailPage(page: LayoutPage): FlatfoxApplicantDetail[] {
  // Spalten anhand der Zeile mit "Beziehung zum Hauptmieter" kalibrieren
  const calLine = page.lines.find((l) => l.tokens[0]?.text.startsWith('Beziehung zum Hauptmieter'));
  if (!calLine) return [];

  const calCells = lineCells(calLine, 25);
  // calCells[0] ist das Label, calCells[1..N] sind Spalten-Werte
  const valueColumnXs = calCells.slice(1).map((c) => c.x);
  const personCount = valueColumnXs.length;
  if (personCount === 0) return [];

  // Pro Person ein leerer Datensatz
  const persons = Array.from({ length: personCount }, () => emptyApplicant());

  // Helper: Wert pro Spalte für eine Zeile zuordnen
  const assignFromLine = (line: LayoutLine, label: string, targetField: keyof FlatfoxApplicantDetail) => {
    const cells = lineCells(line, 25);
    if (!cells.length) return;
    if (!cells[0].text.startsWith(label)) return;
    const values = cells.slice(1);
    for (let i = 0; i < personCount; i++) {
      // Nimm die Zelle, deren X am nächsten zur Spalten-X ist
      const targetX = valueColumnXs[i];
      let best: typeof values[number] | null = null;
      let bestDist = Infinity;
      for (const v of values) {
        const d = Math.abs(v.x - targetX);
        if (d < bestDist) {
          bestDist = d;
          best = v;
        }
      }
      if (best && bestDist < 80) {
        // @ts-expect-error – generisches Setzen
        persons[i][targetField] = best.text;
        persons[i].raw[label] = (persons[i].raw[label] ?? '') + (persons[i].raw[label] ? ' ' : '') + best.text;
      }
    }
  };

  // Felder durchgehen
  const fieldMap: Array<[string, keyof FlatfoxApplicantDetail]> = [
    ['Beziehung zum Hauptmieter', 'relationship'],
    ['Nachname', 'last_name'],
    ['Vorname', 'first_name'],
    ['Geburtsdatum', 'date_of_birth'],
    ['Zivilstand', 'civil_status'],
    ['Geschlecht', 'gender'],
    ['E-Mail', 'email'],
    ['Telefonnummer', 'phone'],
    ['Staatsbürgerschaft', 'nationality'],
    ['Heimatort', 'heimatort'],
    ['Ausländerausweis', 'residence_permit'],
    ['Adresse', 'address'],
    ['Derzeitiger Vermieter', 'previous_landlord'],
    ['Titel', 'profession'],
    ['Arbeitgeber', 'employer'],
    ['Erwerbsstatus', 'employment_status'],
    ['Bruttoeinkommen (p.a.)', 'annual_income'],
    ['Betreibungsverfahren', 'has_debt_collection'],
  ];

  // E-Mail / Telefonnummer / Kontaktperson kommen im Vermieter- und Arbeitgeber-Block
  // mehrfach vor. Wir verarbeiten zeilenweise und tracken Sektionen.
  let section: 'main' | 'address' | 'landlord' | 'work' = 'main';
  let phoneCount = 0;
  let emailCount = 0;

  for (const line of page.lines) {
    const txt = line.tokens.map((t) => t.text).join(' ');
    const trimmed = txt.trim();

    if (trimmed === 'Aktuelle Adresse') section = 'address';
    else if (trimmed === 'Beruf') section = 'work';
    else if (trimmed.startsWith('Derzeitiger Vermieter')) section = 'landlord';

    for (const [label, field] of fieldMap) {
      if (trimmed.startsWith(label)) {
        // Spezialfall: zweite/dritte Telefonnummer/E-Mail (Vermieter, Arbeitgeber)
        if (label === 'Telefonnummer') {
          phoneCount++;
          if (phoneCount === 2 && section === 'landlord') {
            assignFromLine(line, label, 'previous_landlord_phone');
          } else if (phoneCount === 3 && section === 'work') {
            assignFromLine(line, label, 'employer_phone');
          } else {
            assignFromLine(line, label, 'phone');
          }
          break;
        }
        if (label === 'E-Mail') {
          emailCount++;
          if (emailCount === 2 && section === 'landlord') {
            assignFromLine(line, label, 'previous_landlord_email');
          } else {
            assignFromLine(line, label, 'email');
          }
          break;
        }
        assignFromLine(line, label, field);
        break;
      }
    }
  }

  // Mappings auf Enums + Datumsformate anwenden
  for (const p of persons) {
    p.date_of_birth = parseGermanDate(String(p.date_of_birth ?? ''));
    p.civil_status = mapCivilStatus(p.civil_status as unknown as string);
    p.gender = mapGender(p.gender as unknown as string);
    p.residence_permit = mapPermit(p.residence_permit as unknown as string);
    p.employment_status = mapEmployment(p.employment_status as unknown as string);
    p.annual_income = mapMoney(p.annual_income as unknown as string);
    p.has_debt_collection = mapDebt(p.has_debt_collection as unknown as string);
  }

  return persons;
}
