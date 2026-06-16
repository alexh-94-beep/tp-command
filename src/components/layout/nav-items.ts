import {
  LayoutDashboard,
  Home,
  Calendar,
  BookOpen,
  ListChecks,
  Sparkles,
  CreditCard,
  FileText,
  Users,
  Settings,
} from 'lucide-react';
import type { AppRole } from '@/lib/auth/rbac';

export type NavHref =
  | '/dashboard'
  | '/apartments'
  | '/calendar'
  | '/bookings'
  | '/tasks'
  | '/cleaning'
  | '/payments'
  | '/invoices'
  | '/tenants'
  | '/settings';

export type IconType = React.ComponentType<{ className?: string }>;

export interface NavItem {
  label: string;
  href: NavHref;
  icon: IconType;
  roles?: AppRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Wohnungen', href: '/apartments', icon: Home },
  { label: 'Belegung', href: '/calendar', icon: Calendar },
  { label: 'Buchungen', href: '/bookings', icon: BookOpen },
  { label: 'Aufgaben', href: '/tasks', icon: ListChecks, roles: ['admin', 'office'] },
  { label: 'Reinigung', href: '/cleaning', icon: Sparkles },
  {
    label: 'Zahlungen',
    href: '/payments',
    icon: CreditCard,
    roles: ['admin', 'office', 'management'],
  },
  {
    label: 'Rechnungen',
    href: '/invoices',
    icon: FileText,
    roles: ['admin', 'office', 'management'],
  },
  { label: 'Mieter & Gäste', href: '/tenants', icon: Users },
  { label: 'Einstellungen', href: '/settings', icon: Settings, roles: ['admin'] },
];

export function filterForRole(role: AppRole): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(role));
}
