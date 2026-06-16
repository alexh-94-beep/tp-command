'use client';

/**
 * Klickbare Tabellen-Zeile fuer die /cleaning Desktop-Liste.
 *
 * Phase 15: ganze Zeile soll klickbar sein, nicht nur die "Oeffnen"-Spalte.
 * Da Next.js Link nur als <a> rendert (und a-in-tr ungueltiges HTML waere),
 * benutzen wir router.push in einem onClick auf dem <tr>.
 */
import { useRouter } from 'next/navigation';

export default function CleaningRow({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href as never)}
      className="cursor-pointer hover:bg-slate-50"
    >
      {children}
    </tr>
  );
}
