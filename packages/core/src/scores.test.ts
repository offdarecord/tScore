import { describe, expect, it } from 'vitest';
import { SCORE_VALUES, isScoreValue } from './scores.js';

describe('isScoreValue', () => {
  it('accepts every default score value', () => {
    for (const v of SCORE_VALUES) expect(isScoreValue(v)).toBe(true);
  });

  it.each([4, -1, 6, 1.5, '0', null, undefined])('rejects %s', (v) => {
    expect(isScoreValue(v)).toBe(false);
  });
});
