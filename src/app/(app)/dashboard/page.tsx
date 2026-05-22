export const metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Phase 0 ist aufgesetzt: Login, geschütztes Layout und Datenmodell stehen.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Nächste Schritte</h2>
        <p className="mt-1 text-sm text-slate-500">
          Die Kennzahlen-Übersicht (freie Wohnungen, Ein-/Auszüge, offene Reinigungen,
          Handlungsbedarf) entsteht in Phase 9. Ab Phase 1 wird die Sidebar Modul für
          Modul aktiviert.
        </p>
      </div>
    </div>
  );
}
