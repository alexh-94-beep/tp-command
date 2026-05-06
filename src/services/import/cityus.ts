/**
 * Parser für Cityus-Wochenpläne (xlsx).
 *
 * Format pro Datei:
 *   Header   – "ZURICH - Weekly Cleaning Planning" + Datumsbereich
 *   ARRIVALS – Anreisen-Liste (Datum, Wohnung, Typ, Gast, "Arrival Check")
 *   CHECK-OUTS – Abreisen-Liste (Datum, Wohnung, Typ, Gast, "Final clean (Tag)")
 *   Daily Plan – tagesweise (Monday/Tuesday/…) mit "Final clean", "Weekly clean", "Weekly clean & change of linen"
 *
 * Wir nutzen nur ARRIVALS + CHECK-OUTS, weil der Daily-Plan davon abgeleitet ist.
 * Wöchentliche Reinigung kommt aus dem Daily-Plan-Sheet als zusätzliche Aufträge.
 */
import * as XLSX from 'xlsx';

export interface CityusStayRow {
  rowNumber: number;
  apartment_short: string;        // "D803"
  apartment_number: string;       // "D.0803" – unser Format
  apartment_label: string;        // "Zurich - 50m2 - Junior Apartments"
  guest_name: string;
  check_in_date?: string;         // ISO YYYY-MM-DD (aus ARRIVALS-Sektion)
  check_out_date?: string;        // ISO YYYY-MM-DD (aus CHECK-OUTS-Sektion)
}

export interface CityusWeeklyTaskRow {
  rowNumber: number;
  apartment_short: string;
  apartment_number: string;
  guest_name: string;
  date: string;                    // ISO YYYY-MM-DD
  task_type: 'weekly_clean' | 'weekly_clean_linen' | 'final_clean';
  raw_description: string;
}

export interface CityusParseResult {
  weekRange: string | null;
  stays: CityusStayRow[];          // Arrivals + Check-outs zusammengeführt
  weeklyTasks: CityusWeeklyTaskRow[];
  warnings: { rowNumber: number; message: string }[];
}

const monthNames: Record<string, number> = {
  jan: 1, januar: 1, january: 1,
  feb: 2, februar: 2, february: 2,
  mar: 3, mär: 3, märz: 3, march: 3,
  apr: 4, april: 4,
  mai: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, okt: 10, october: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, dez: 12, december: 12, dezember: 12,
};

function parseDateLoose(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(
      raw.getDate(),
    ).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  // "Mo, 20.04.2026" oder "So,26.04.2026"
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  // "20 April 2026"
  const m2 = s.match(/(\d{1,2})\s+([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/);
  if (m2) {
    const month = monthNames[m2[2].toLowerCase()];
    if (month) {
      return `${m2[3]}-${String(month).padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Mappe Cityus-Wohnungs-Kürzel auf unser Format.
 *   D803 → D.0803
 *   E202 → E.0202
 *   E1003 → E.1003
 */
export function cityusToApartmentNumber(short: string): string | null {
  const m = short.trim().match(/^([A-Z])\s*(\d{3,4})$/);
  if (!m) return null;
  const letter = m[1];
  const num = m[2].padStart(4, '0');
  return `${letter}.${num}`;
}

/**
 * Erkennt ob eine Aufgabe wöchentlich ist (mit/ohne Bettwäsche) oder ein Final clean.
 */
function classifyDailyTask(desc: string): CityusWeeklyTaskRow['task_type'] | null {
  const d = desc.toLowerCase();
  if (d.includes('weekly') && d.includes('linen')) return 'weekly_clean_linen';
  if (d.includes('weekly')) return 'weekly_clean';
  if (d.includes('final')) return 'final_clean';
  return null;
}

export function parseCityusPlan(buffer: Buffer): CityusParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Keine Tabelle in Datei.');

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });

  const result: CityusParseResult = {
    weekRange: null,
    stays: [],
    weeklyTasks: [],
    warnings: [],
  };

  // Header (Zeile 2: "20.04.2026 - 26.04.2026")
  for (let i = 0; i < Math.min(5, aoa.length); i++) {
    const row = aoa[i] as unknown[];
    const text = row.map((c) => String(c ?? '')).join(' ');
    if (/\d{1,2}\.\d{1,2}\.\d{4}\s*[-–]\s*\d{1,2}\.\d{1,2}\.\d{4}/.test(text)) {
      result.weekRange = text.trim();
      break;
    }
  }

  // Sektionen erkennen
  let mode: 'none' | 'arrivals' | 'checkouts' | 'daily' = 'none';
  const arrivalsByKey = new Map<string, CityusStayRow>(); // key = apartment+guest
  const checkoutsByKey = new Map<string, CityusStayRow>();

  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    const cellTexts = row.map((c) => String(c ?? '').trim());
    const allText = cellTexts.join(' ').trim();
    const rowNumber = i + 1;

    // Sektions-Header
    if (/^ARRIVALS$/i.test(allText) || /^ARRIVALS\s/i.test(allText) || cellTexts.includes('ARRIVALS')) {
      mode = 'arrivals';
      continue;
    }
    if (cellTexts.includes('CHECK-OUTS') || /CHECK-?OUTS/i.test(allText)) {
      mode = 'checkouts';
      continue;
    }
    // "Monday", "Tuesday", … startet daily
    const dayMatch = cellTexts.find((t) => /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(t));
    if (dayMatch) {
      mode = 'daily';
    }

    if (mode === 'none') continue;

    // ARRIVALS / CHECK-OUTS Format:
    //   Col 0: 'sent' | leer
    //   Col 1: Datum
    //   Col 2: Wohnung (z.B. D803)
    //   Col 3: Typ (z.B. "Zurich - 50m2 - Junior Apartments")
    //   Col 4: Gastname
    //   Col 5: Aufgabe ("Arrival Check" / "Final clean (...)")
    if (mode === 'arrivals' || mode === 'checkouts') {
      const aptShort = cellTexts[2];
      const guest = cellTexts[4];
      const dateRaw = row[1] ?? cellTexts[1];
      if (!aptShort || !guest) continue;
      const aptNumber = cityusToApartmentNumber(aptShort);
      if (!aptNumber) {
        result.warnings.push({ rowNumber, message: `Wohnungs-Format unbekannt: "${aptShort}"` });
        continue;
      }
      const date = parseDateLoose(dateRaw);
      if (!date) {
        result.warnings.push({ rowNumber, message: `Datum nicht parsebar: "${dateRaw}"` });
        continue;
      }
      const stay: CityusStayRow = {
        rowNumber,
        apartment_short: aptShort,
        apartment_number: aptNumber,
        apartment_label: cellTexts[3] ?? '',
        guest_name: guest,
        check_in_date: mode === 'arrivals' ? date : undefined,
        check_out_date: mode === 'checkouts' ? date : undefined,
      };
      const key = `${aptNumber}|${guest.toLowerCase()}`;
      if (mode === 'arrivals') arrivalsByKey.set(key, stay);
      else checkoutsByKey.set(key, stay);
      continue;
    }

    // DAILY-Plan
    if (mode === 'daily') {
      // Col 0: Wochentag (nur erste Zeile pro Tag) | leer
      // Col 1: Datum (date)
      // Col 2: Wohnung
      // Col 3: Typ
      // Col 4: Gast
      // Col 5: Aufgabe
      const aptShort = cellTexts[2];
      const guest = cellTexts[4];
      const dateRaw = row[1];
      const taskDesc = cellTexts[5];
      if (!aptShort || !taskDesc) continue;
      const aptNumber = cityusToApartmentNumber(aptShort);
      if (!aptNumber) continue;
      const date = parseDateLoose(dateRaw);
      if (!date) continue;
      const taskType = classifyDailyTask(taskDesc);
      if (!taskType || taskType === 'final_clean') continue; // final_clean kommt schon aus check-outs

      result.weeklyTasks.push({
        rowNumber,
        apartment_short: aptShort,
        apartment_number: aptNumber,
        guest_name: guest,
        date,
        task_type: taskType,
        raw_description: taskDesc,
      });
    }
  }

  // ARRIVALS und CHECK-OUTS pro Gast+Wohnung zusammenführen, ABER:
  // wenn der Check-out vor dem Arrival liegt (Gast checkt aus + wieder ein),
  // sind das zwei separate Aufenthalte → wir behalten beide.
  const stays: CityusStayRow[] = [];
  const seenArrivalKeys = new Set<string>();

  for (const [k, arrival] of arrivalsByKey) {
    const checkout = checkoutsByKey.get(k);
    if (
      checkout?.check_out_date &&
      arrival.check_in_date &&
      checkout.check_out_date < arrival.check_in_date
    ) {
      // Separate Aufenthalte: alter Auszug + neue Anreise nebeneinander
      stays.push({ ...checkout });
      stays.push({ ...arrival });
    } else if (checkout?.check_out_date) {
      stays.push({ ...arrival, check_out_date: checkout.check_out_date });
    } else {
      stays.push({ ...arrival });
    }
    seenArrivalKeys.add(k);
  }
  // Check-outs ohne dazugehörige Arrival in dieser Woche
  for (const [k, checkout] of checkoutsByKey) {
    if (seenArrivalKeys.has(k)) continue;
    stays.push({ ...checkout });
  }
  result.stays = stays;

  return result;
}
