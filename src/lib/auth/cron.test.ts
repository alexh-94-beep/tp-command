import { describe, it, expect } from 'vitest';
import { isAuthorizedCron } from './cron';

describe('isAuthorizedCron', () => {
  it('expected nicht gesetzt → false', () => {
    expect(isAuthorizedCron('Bearer abc', undefined)).toBe(false);
    expect(isAuthorizedCron('Bearer abc', '')).toBe(false);
  });

  it('provided fehlt → false', () => {
    expect(isAuthorizedCron(null, 'sekret')).toBe(false);
  });

  it('falsche Lange → false', () => {
    expect(isAuthorizedCron('Bearer kurz', 'lang-und-anders')).toBe(false);
  });

  it('falscher Wert → false', () => {
    expect(isAuthorizedCron('Bearer falsch', 'sekret')).toBe(false);
  });

  it('exakter Match → true', () => {
    expect(isAuthorizedCron('Bearer sekret', 'sekret')).toBe(true);
  });

  it('case-sensitive — Bearer mit kleinem b → false', () => {
    expect(isAuthorizedCron('bearer sekret', 'sekret')).toBe(false);
  });

  it('extra whitespace → false', () => {
    expect(isAuthorizedCron('Bearer  sekret', 'sekret')).toBe(false);
    expect(isAuthorizedCron('Bearer sekret ', 'sekret')).toBe(false);
  });
});
