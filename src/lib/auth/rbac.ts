/**
 * Rollen-basierte Zugriffsrechte.
 * Source of Truth bleibt Postgres RLS – diese Helper sind für UI-Entscheidungen
 * (Buttons ein-/ausblenden, Routen-Guards) und vermeiden unnötige DB-Calls.
 */

export type AppRole = 'admin' | 'office' | 'cleaning' | 'management';

export type Resource =
  | 'apartment'
  | 'booking'
  | 'tenant'
  | 'payment'
  | 'cleaning_task'
  | 'communication'
  | 'channel'
  | 'user'
  | 'audit_log';

export type Action = 'read' | 'create' | 'update' | 'delete';

const matrix: Record<AppRole, Partial<Record<Resource, Action[]>>> = {
  admin: {
    apartment: ['read', 'create', 'update', 'delete'],
    booking: ['read', 'create', 'update', 'delete'],
    tenant: ['read', 'create', 'update', 'delete'],
    payment: ['read', 'create', 'update', 'delete'],
    cleaning_task: ['read', 'create', 'update', 'delete'],
    communication: ['read', 'create', 'update', 'delete'],
    channel: ['read', 'create', 'update', 'delete'],
    user: ['read', 'create', 'update', 'delete'],
    audit_log: ['read'],
  },
  office: {
    apartment: ['read', 'create', 'update'],
    booking: ['read', 'create', 'update'],
    tenant: ['read', 'create', 'update'],
    payment: ['read', 'create', 'update'],
    cleaning_task: ['read', 'create', 'update'],
    communication: ['read', 'create', 'update'],
    channel: ['read'],
    user: ['read'],
  },
  cleaning: {
    cleaning_task: ['read', 'update'],
    apartment: ['read'],
  },
  management: {
    apartment: ['read'],
    booking: ['read'],
    tenant: ['read'],
    payment: ['read'],
    cleaning_task: ['read'],
    communication: ['read'],
    channel: ['read'],
    user: ['read'],
    audit_log: ['read'],
  },
};

export function can(
  role: AppRole | null | undefined,
  action: Action,
  resource: Resource,
): boolean {
  if (!role) return false;
  return matrix[role]?.[resource]?.includes(action) ?? false;
}
