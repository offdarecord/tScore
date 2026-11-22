import { describe, expect, it } from 'vitest';
import { decodeRow } from './row-decision.js';

const VALUES = [0, 1, 2, 3, 5] as const;
const row = (s: string) => [...s].map((c) => c === 'x');

describe('decodeRow (regional card, values 0 1 2 3 5)', () => {
  it.each([
    ['x....', 0],
    ['.x...', 1],
    ['..x..', 2],
    ['...x.', 3],
    ['....x', 5],
  ])('one hole %s reads %d', (cells, expected) => {
    expect(decodeRow(VALUES, row(cells))).toEqual({
      kind: 'value',
      value: expected,
      inverse: false,
    });
  });

  it.each([
    ['.xxxx', 0],
    ['xx.xx', 2],
    ['xxxx.', 5],
  ])('four holes %s is an inverse correction reading %d', (cells, expected) => {
    expect(decodeRow(VALUES, row(cells))).toEqual({
      kind: 'value',
      value: expected,
      inverse: true,
    });
  });

  it('no holes is NO_PUNCH', () => {
    expect(decodeRow(VALUES, row('.....'))).toEqual({ kind: 'flag', flag: 'NO_PUNCH' });
  });

  it.each(['xx...', 'x.x.x', 'xxxxx'])('%s is MULTI_PUNCH', (cells) => {
    expect(decodeRow(VALUES, row(cells))).toEqual({ kind: 'flag', flag: 'MULTI_PUNCH' });
  });

  it('rejects mismatched lengths', () => {
    expect(() => decodeRow(VALUES, row('x...'))).toThrow(RangeError);
  });
});
