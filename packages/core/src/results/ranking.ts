import type { Direction, TieBreak } from './model.js';

/** What ranking looks at for one entry in one class. */
export interface RankKey {
  readonly total: number;
  /** How many sections were scored at each value. Missing values count as 0. */
  readonly counts: ReadonlyMap<number, number>;
  /** Ride-off position, if a ride-off was held. */
  readonly rideOff?: number | undefined;
}

type Rule =
  | { readonly kind: 'total' }
  | { readonly kind: 'ride_off' }
  | { readonly kind: 'most' | 'fewest'; readonly value: number };

export function parseTieBreak(t: TieBreak): Rule {
  if (t === 'total') return { kind: 'total' };
  if (t === 'ride_off') return { kind: 'ride_off' };
  const m = /^(most|fewest)_(\d{1,2})$/.exec(t);
  if (!m) throw new RangeError(`Unknown tie-break "${t}"`);
  return { kind: m[1] as 'most' | 'fewest', value: Number(m[2]) };
}

/**
 * Builds a comparator: negative when `a` ranks ahead of `b`, 0 when every tie-break is equal.
 *
 * - `total`: lower is better (`low_wins`) or higher is better (`high_wins`, gate trials).
 * - `most_N`: more sections scored N is better. `fewest_N`: fewer is better.
 * - `ride_off`: lower ride-off position is better; only applies when both entries rode it off.
 */
export function makeComparator(
  tieBreaks: readonly TieBreak[],
  direction: Direction,
): (a: RankKey, b: RankKey) => number {
  const rules = tieBreaks.map(parseTieBreak);
  const count = (k: RankKey, v: number) => k.counts.get(v) ?? 0;
  return (a, b) => {
    for (const r of rules) {
      let d = 0;
      switch (r.kind) {
        case 'total':
          d = direction === 'low_wins' ? a.total - b.total : b.total - a.total;
          break;
        case 'most':
          d = count(b, r.value) - count(a, r.value);
          break;
        case 'fewest':
          d = count(a, r.value) - count(b, r.value);
          break;
        case 'ride_off':
          if (a.rideOff !== undefined && b.rideOff !== undefined) d = a.rideOff - b.rideOff;
          break;
      }
      if (d !== 0) return d;
    }
    return 0;
  };
}

export interface Placed<T> {
  readonly item: T;
  /** 1-based placing. Entries equal on every tie-break share a placing (1, 1, 3). */
  readonly place: number;
  readonly tiedWithPrevious: boolean;
}

/**
 * Sorts and places items. `displayOrder` only orders exact ties (e.g. by rider number); it never
 * changes a placing.
 */
export function rank<T>(
  items: readonly T[],
  key: (item: T) => RankKey,
  compare: (a: RankKey, b: RankKey) => number,
  displayOrder: (a: T, b: T) => number,
): Placed<T>[] {
  const sorted = [...items].sort((a, b) => compare(key(a), key(b)) || displayOrder(a, b));
  const placed: Placed<T>[] = [];
  sorted.forEach((item, i) => {
    const prev = placed[i - 1];
    const tied = prev !== undefined && compare(key(prev.item), key(item)) === 0;
    placed.push({ item, place: tied && prev ? prev.place : i + 1, tiedWithPrevious: tied });
  });
  return placed;
}
