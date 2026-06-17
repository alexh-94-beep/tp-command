import { requireUser } from '@/lib/auth/session';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileNav } from '@/components/layout/mobile-nav';

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  office: 'Office',
  cleaning: 'Reinigung',
  management: 'Management',
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      <Sidebar role={user.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileNav
          role={user.role}
          userName={user.fullName}
          userRoleLabel={roleLabel[user.role] ?? user.role}
        />
        <Topbar user={user} />
        <main
          className="flex-1 overflow-auto p-3 sm:p-4 md:p-6"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
