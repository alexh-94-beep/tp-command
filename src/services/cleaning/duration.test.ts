import { describe, it, expect } from 'vitest';
import {
  applySpeedFactor,
  estimateDurationMinutes,
  isLinenChange,
} from './duration';

describe('estimateDurationMinutes', () => {
  it('booking senior checkout = 75 min', () => {
    expect(estimateDurationMinutes('booking', 'senior', 'checkout')).toBe(75);
  });

  it('booking junior checkout = 60 min', () => {
    expect(estimateDurationMinutes('booking', 'junior', 'checkout')).toBe(60);
  });

  it('cityus weekly_clean_linen senior dauert laenger als ohne linen', () => {
    const linen = estimateDurationMinutes('cityus', 'senior', 'weekly_clean_linen');
    const plain = estimateDurationMinutes('cityus', 'senior', 'weekly_clean');
    expect(linen).toBeGreaterThan(plain);
  });

  it('own senior deep_clean = 240 min', () => {
    expect(estimateDurationMinutes('own', 'senior', 'deep_clean')).toBe(240);
  });

  it('unbekannte Kombination -> Fallback 60', () => {
    expect(estimateDurationMinutes('own', 'senior', 'doesnt_exist')).toBe(60);
    expect(estimateDurationMinutes('booking', 'junior', 'weekly_clean')).toBe(60);
  });

  it('apartmentType wird normalisiert: alles ausser junior -> senior', () => {
    expect(estimateDurationMinutes('booking', 'suite', 'checkout')).toBe(75);
    expect(estimateDurationMinutes('booking', 'studio', 'checkout')).toBe(75);
  });
});

describe('applySpeedFactor', () => {
  it('Standard 1.0 = unveraendert', () => {
    expect(applySpeedFactor(60, 1.0)).toBe(60);
  });

  it('Duo-Faktor 0.5 = halbe Zeit', () => {
    expect(applySpeedFactor(60, 0.5)).toBe(30);
  });

  it('rundet auf naechste ganze Minute', () => {
    expect(applySpeedFactor(60, 0.66)).toBe(40); // 39.6 -> 40
  });
});

describe('isLinenChange', () => {
  it('taskType weekly_clean_linen -> true', () => {
    expect(isLinenChange('weekly_clean_linen', null)).toBe(true);
  });

  it('Notiz "linen" erkannt', () => {
    expect(isLinenChange('weekly_clean', 'bitte mit linen')).toBe(true);
  });

  it('Notiz "Bettwäsche" erkannt (Umlaut + ae-Variante)', () => {
    expect(isLinenChange('weekly_clean', 'Bettwäsche wechseln')).toBe(true);
    expect(isLinenChange('weekly_clean', 'bettwaesche wechseln')).toBe(true);
  });

  it('Notiz ohne Linen-Hinweis -> false', () => {
    expect(isLinenChange('weekly_clean', 'normale Reinigung')).toBe(false);
    expect(isLinenChange('weekly_clean', null)).toBe(false);
  });
});
