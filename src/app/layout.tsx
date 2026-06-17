import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'TP-Command', template: '%s · TP-Command' },
  description: 'Internes Betriebssystem für möblierte Apartments',
};

// Mobile: viewport-fit=cover aktiviert env(safe-area-inset-*) auf
// iPhones mit Notch / Home-Indikator.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
