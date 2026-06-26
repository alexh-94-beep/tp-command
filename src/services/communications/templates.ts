/**
 * Mail-Templates fuer die Buchungs-Kommunikation.
 *
 * Annahme #22 aus docs/04-annahmen.md: "Im MVP nur Plain-Drafts mit
 * Vorschau, kein Auto-Versand." Deshalb sind die Templates pure
 * String-Generatoren — kein react-email-Rendering, keine Inline-CSS-Mails.
 * Office sieht den fertigen Text und kann ihn vor dem Senden manuell
 * anpassen.
 *
 * Jedes Template bekommt einen `TemplateContext` (Buchung + Mieter +
 * optional zusaetzliche Felder) und gibt {subject, body} zurueck.
 */
import type { CommunicationType } from '@/types/aliases';

export interface TemplateContext {
  guestFirstName: string;
  guestLastName: string;
  apartmentNumber: string;
  apartmentBuilding: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  rentAmount: number;
  depositAmount: number;
  rentalType: 'long_term' | 'short_term' | 'booking' | 'day_stay';
  // Optionale Felder fuer spezifische Templates
  wifiSsid?: string;
  wifiPassword?: string;
  keyBoxCode?: string;
  paymentDueDate?: string;
  paymentAmount?: number;
  paymentReference?: string;
}

export interface RenderedTemplate {
  subject: string;
  body: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function fmtAmount(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 2,
  }).format(amount);
}

function greeting(ctx: TemplateContext): string {
  return `Liebe(r) ${ctx.guestFirstName} ${ctx.guestLastName}`;
}

function signature(): string {
  return [
    '',
    'Freundliche Grüsse',
    'ThreePoint Team',
    '',
    'ThreePoint AG',
    'Stettbachstrasse 14',
    '8600 Dübendorf',
    'office@threepoint.ch',
  ].join('\n');
}

// ── Templates ──────────────────────────────────────────────────────────

export function tplWelcome(ctx: TemplateContext): RenderedTemplate {
  return {
    subject: `Willkommen bei ThreePoint – Wohnung ${ctx.apartmentNumber}`,
    body: [
      greeting(ctx),
      '',
      `Herzlich willkommen bei ThreePoint! Wir freuen uns sehr, dass Sie bei uns einziehen.`,
      '',
      `Ihre Buchung im Überblick:`,
      `– Wohnung: ${ctx.apartmentNumber} (Gebäude ${ctx.apartmentBuilding})`,
      `– Einzug:  ${fmtDate(ctx.startDate)}`,
      `– Auszug:  ${ctx.endDate === '9999-12-31' ? 'unbefristet' : fmtDate(ctx.endDate)}`,
      `– Mietzins: ${fmtAmount(ctx.rentAmount)}/Monat`,
      ...(ctx.depositAmount > 0
        ? [`– Depot:    ${fmtAmount(ctx.depositAmount)} (einmalig)`]
        : []),
      '',
      `Die genauen Anreise-Infos folgen kurz vor Ihrem Einzug per separater Mail.`,
      `Bei Fragen erreichen Sie uns jederzeit unter office@threepoint.ch oder telefonisch.`,
      signature(),
    ].join('\n'),
  };
}

export function tplCheckin(ctx: TemplateContext): RenderedTemplate {
  return {
    subject: `Ihre Anreise am ${fmtDate(ctx.startDate)} – Wohnung ${ctx.apartmentNumber}`,
    body: [
      greeting(ctx),
      '',
      `Ihre Anreise steht kurz bevor – hier alle wichtigen Infos auf einen Blick:`,
      '',
      `Adresse:`,
      `Stettbachstrasse 14, 8600 Dübendorf`,
      `Wohnung ${ctx.apartmentNumber} (Gebäude ${ctx.apartmentBuilding})`,
      '',
      `Schlüsselbox:`,
      ctx.keyBoxCode
        ? `Code: ${ctx.keyBoxCode} – die Box befindet sich am Eingang.`
        : `Den Code für die Schlüsselbox erhalten Sie am Vortag per separater Nachricht.`,
      '',
      `Einzugs-Zeit: ab 15:00 Uhr am ${fmtDate(ctx.startDate)}.`,
      `Falls Sie deutlich später anreisen oder Hilfe brauchen, melden Sie sich bitte vorher.`,
      '',
      `WLAN-Zugang und weitere Hausinfos finden Sie in der Wohnung. Bei Fragen sind wir telefonisch erreichbar.`,
      signature(),
    ].join('\n'),
  };
}

export function tplWifi(ctx: TemplateContext): RenderedTemplate {
  return {
    subject: `WLAN-Zugang – Wohnung ${ctx.apartmentNumber}`,
    body: [
      greeting(ctx),
      '',
      `Hier die Zugangsdaten für das WLAN in Ihrer Wohnung:`,
      '',
      `Netzwerk (SSID): ${ctx.wifiSsid ?? '<bitte ergänzen>'}`,
      `Passwort:        ${ctx.wifiPassword ?? '<bitte ergänzen>'}`,
      '',
      `Der Drucker steht im Gemeinschaftsbereich – die Anleitung finden Sie auf dem Gerät.`,
      `Falls etwas nicht funktioniert, geben Sie uns kurz Bescheid.`,
      signature(),
    ].join('\n'),
  };
}

export function tplPaymentReminder(ctx: TemplateContext): RenderedTemplate {
  const amount = ctx.paymentAmount ?? ctx.rentAmount;
  return {
    subject: `Zahlungserinnerung – Wohnung ${ctx.apartmentNumber}`,
    body: [
      greeting(ctx),
      '',
      `In unseren Büchern ist eine offene Zahlung verzeichnet:`,
      '',
      `Betrag:      ${fmtAmount(amount)}`,
      ctx.paymentDueDate
        ? `Fällig seit: ${fmtDate(ctx.paymentDueDate)}`
        : `Bitte zeitnah begleichen.`,
      ctx.paymentReference ? `Referenz:    ${ctx.paymentReference}` : '',
      '',
      `Bitte überweisen Sie den Betrag auf unser bekanntes Konto. Falls Sie bereits bezahlt haben, ignorieren Sie diese Erinnerung – dann hat sich unsere Mail mit Ihrer Zahlung überschnitten.`,
      '',
      `Bei Fragen oder offenen Punkten schreiben Sie uns einfach.`,
      signature(),
    ]
      .filter((l) => l !== '')
      .join('\n')
      // Doppel-Leerzeilen wiederherstellen (filter entfernte alle leeren)
      .replace(
        /Liebe\(r\) (.+)\nIn unseren Büchern/,
        'Liebe(r) $1\n\nIn unseren Büchern',
      ),
  };
}

export function tplCheckout(ctx: TemplateContext): RenderedTemplate {
  return {
    subject: `Auszug am ${fmtDate(ctx.endDate)} – Wohnung ${ctx.apartmentNumber}`,
    body: [
      greeting(ctx),
      '',
      `Ihr Auszug steht an. Damit alles reibungslos läuft, hier eine kurze Checkliste:`,
      '',
      `– Schlüssel: Bitte am Tag des Auszugs bis spätestens 11:00 Uhr in der Schlüsselbox deponieren.`,
      `– Wohnung:   Komplett räumen (auch Kühlschrank, Briefkasten, Keller).`,
      `– Müll:      Bitte mitnehmen oder in den richtigen Behälter.`,
      `– Schäden:   Bei Beschädigungen kurz Bescheid geben, damit wir rechtzeitig reagieren können.`,
      '',
      `Auszugs-Datum: ${fmtDate(ctx.endDate)}`,
      '',
      ...(ctx.rentalType === 'long_term'
        ? [
            `Falls das Depot zurückerstattet werden soll: bitte Bankverbindung an office@threepoint.ch senden, sobald die Wohnungsabnahme erfolgt ist.`,
            '',
          ]
        : []),
      `Wir hoffen, Sie haben sich bei uns wohlgefühlt – und freuen uns auf ein Wiedersehen, falls Sie wieder einmal in Dübendorf vorbeischauen.`,
      signature(),
    ].join('\n'),
  };
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Die Templates, die im UI als Auswahl angeboten werden. Internal-only
 * Templates (z.B. internal_cleaning_notification) sind hier nicht
 * sichtbar — die werden vom System direkt erzeugt.
 */
export const PUBLIC_TEMPLATES: ReadonlyArray<{
  key: CommunicationType;
  label: string;
  description: string;
}> = [
  {
    key: 'welcome',
    label: 'Willkommen',
    description: 'Begrüssung nach Vertragsabschluss / Buchung',
  },
  {
    key: 'checkin_info',
    label: 'Anreise-Infos',
    description: 'Adresse, Schlüsselbox, Check-in-Zeit',
  },
  {
    key: 'wifi_info',
    label: 'WLAN-Zugang',
    description: 'Netzwerk-Name + Passwort',
  },
  {
    key: 'payment_reminder',
    label: 'Zahlungs-Erinnerung',
    description: 'Höfliche Erinnerung für offene Zahlung',
  },
  {
    key: 'checkout_info',
    label: 'Auszugs-Infos',
    description: 'Checkliste vor Auszug + Schlüsselrückgabe',
  },
];

export function renderTemplate(
  key: CommunicationType,
  ctx: TemplateContext,
): RenderedTemplate {
  switch (key) {
    case 'welcome':
      return tplWelcome(ctx);
    case 'checkin_info':
      return tplCheckin(ctx);
    case 'wifi_info':
      return tplWifi(ctx);
    case 'payment_reminder':
      return tplPaymentReminder(ctx);
    case 'checkout_info':
      return tplCheckout(ctx);
    case 'payment_info':
    case 'internal_cleaning_notification':
      // Aktuell nicht im UI verfuegbar — Office nutzt Welcome/CheckIn.
      throw new Error(`Template ${key} ist (noch) nicht implementiert`);
  }
}
