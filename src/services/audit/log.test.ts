import { describe, it, expect } from 'vitest';
import { computeDiff, isInterestingDiff } from './log';

describe('computeDiff', () => {
  it('keine Aenderung → leerer Diff', () => {
    expect(computeDiff({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual({});
  });

  it('einzelne Aenderung → ein Eintrag', () => {
    expect(computeDiff({ status: 'open' }, { status: 'done' })).toEqual({
      status: { before: 'open', after: 'done' },
    });
  });

  it('neue Felder → before=undefined', () => {
    expect(computeDiff({}, { x: 7 })).toEqual({
      x: { before: undefined, after: 7 },
    });
  });

  it('entfernte Felder → after=undefined', () => {
    expect(computeDiff({ a: 1 }, {})).toEqual({
      a: { before: 1, after: undefined },
    });
  });

  it('null vs undefined → as is (kein Sonderfall)', () => {
    expect(computeDiff({ a: null }, { a: undefined })).toEqual({
      a: { before: null, after: undefined },
    });
  });

  it('Arrays gleich → kein Diff', () => {
    expect(computeDiff({ tags: [1, 2] }, { tags: [1, 2] })).toEqual({});
  });

  it('Arrays verschieden → Diff', () => {
    expect(computeDiff({ tags: [1] }, { tags: [1, 2] })).toEqual({
      tags: { before: [1], after: [1, 2] },
    });
  });

  it('mehrere Aenderungen', () => {
    const d = computeDiff(
      { status: 'open', priority: 'low', notes: 'x' },
      { status: 'done', priority: 'low', notes: 'y' },
    );
    expect(Object.keys(d).sort()).toEqual(['notes', 'status']);
  });
});

describe('isInterestingDiff', () => {
  it('leer → false', () => {
    expect(isInterestingDiff({})).toBe(false);
  });
  it('eine Aenderung → true', () => {
    expect(isInterestingDiff({ x: { before: 1, after: 2 } })).toBe(true);
  });
});
