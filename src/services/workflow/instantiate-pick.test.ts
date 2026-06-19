import { describe, it, expect } from 'vitest';
import { pickAssignee } from './instantiate';

const users = [
  { id: 'u-alex', role: 'admin' },
  { id: 'u-brian', role: 'office' },
  { id: 'u-sharon', role: 'office' },
  { id: 'u-mireme', role: 'cleaning' },
];

describe('pickAssignee', () => {
  it('any oder null → null', () => {
    expect(pickAssignee(null, null, users)).toBeNull();
    expect(pickAssignee('any', null, users)).toBeNull();
  });

  it('ohne creator → erster passender User', () => {
    expect(pickAssignee('office', null, users)).toBe('u-brian');
    expect(pickAssignee('cleaning', null, users)).toBe('u-mireme');
  });

  it('creator passt zur Rolle → creator wird genommen (statt erster office)', () => {
    const sharon = { id: 'u-sharon', role: 'office' };
    expect(pickAssignee('office', sharon, users)).toBe('u-sharon');
  });

  it('admin als creator → wenn Rollen-User da ist, geht der Task an den Rollen-User (nicht den Admin)', () => {
    // Phase 25c-Bug-Fix: vorher landeten cleaning-Tasks (z.B. "Inventar
    // pruefen") beim Admin-Creator. Jetzt korrekt: Mireme statt Alex.
    const alex = { id: 'u-alex', role: 'admin' };
    expect(pickAssignee('office', alex, users)).toBe('u-brian');
    expect(pickAssignee('cleaning', alex, users)).toBe('u-mireme');
  });

  it('admin als creator + keine Rollen-User → Admin als Fallback (statt verwaister Task)', () => {
    const alex = { id: 'u-alex', role: 'admin' };
    expect(pickAssignee('cleaning', alex, [alex])).toBe('u-alex');
  });

  it('creator passt nicht → Fallback firstOfRole', () => {
    const mireme = { id: 'u-mireme', role: 'cleaning' };
    expect(pickAssignee('office', mireme, users)).toBe('u-brian');
  });

  it('keine passenden User → null', () => {
    expect(pickAssignee('management', null, users)).toBeNull();
  });
});
