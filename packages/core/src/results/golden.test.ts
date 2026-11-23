/**
 * Golden events: real club events, anonymised, whose results the engine must reproduce.
 *
 * Each fixture in fixtures/golden/ holds the event input (classes, riders by number, cards) and,
 * per class, the totals and order from the scoring workbook used on the day. Riders are
 * identified only by number. Where the workbook was saved before its final sort
 * (`orderFromWorkbook: false`), only totals and statuses are checked, not order.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeResults } from './compute.js';
import { DEFAULT_SCORING, type EventInput } from './model.js';

interface GoldenFixture {
  readonly event: Omit<EventInput, 'scoring'>;
  /** True when the workbook's saved order is its final sorted order. */
  readonly orderFromWorkbook: boolean;
  /**
   * Per class, in the workbook's order: each rider's total, or "DNF" / "DNS", or "INCOMPLETE"
   * when the workbook left the total blank because a card was missing.
   */
  readonly expected: Record<string, { number: number; total: number | string }[]>;
}

const DIR = new URL('../../../../fixtures/golden/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const OPTIONS = {
  generator: { name: 'tScore', version: 'golden' },
  generatedAt: '2000-01-01T00:00:00+00:00',
  status: 'provisional' as const,
  revision: 1,
};
const byNumber = (a: { number: number }, b: { number: number }) => a.number - b.number;

describe.each(files)('golden event %s', (file) => {
  const golden = JSON.parse(readFileSync(new URL(file, DIR), 'utf8')) as GoldenFixture;
  const input: EventInput = { ...golden.event, scoring: DEFAULT_SCORING };
  const { results, gaps } = computeResults(input, OPTIONS);
  const check = golden.orderFromWorkbook ? 'same order and totals' : 'same totals';

  it('contains no personal data: no text except class names and status words', () => {
    const allowed = new Set([
      ...golden.event.classes.map((c) => c.name),
      'Rider',
      'Passenger',
      'competitive',
      'no_award',
      'non_competitive',
      'riding',
      'dnf',
      'dns',
      'other',
      'DNF',
      'DNS',
      'INCOMPLETE',
    ]);
    const freeText = new Set(['source', 'id', 'code', 'name', 'date']);
    const found: string[] = [];
    const walk = (v: unknown, key: string): void => {
      if (typeof v === 'string') {
        if (!allowed.has(v) && !/^\d+$/.test(v) && !freeText.has(key)) found.push(`${key}: ${v}`);
      } else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) walk(x, Array.isArray(v) ? key : k);
      }
    };
    walk(golden, '');
    expect(found).toEqual([]);
    expect(golden.event.name).toMatch(/^Golden event G\d+$/);
  });

  it.each(Object.keys(golden.expected))(`class %s: ${check}`, (cls) => {
    const incomplete = new Set(gaps.filter((g) => g.className === cls).map((g) => g.number));
    const actual = results.classes.find((c) => c.name === cls);
    let got = (actual?.entries ?? []).map((e) => ({
      number: e.number,
      total:
        e.status === 'dnf'
          ? 'DNF'
          : e.status === 'dns'
            ? 'DNS'
            : incomplete.has(e.number)
              ? 'INCOMPLETE'
              : e.total,
    }));
    let expected = golden.expected[cls] ?? [];

    // A rider still "riding" with a card missing is a data-entry gap on the day. The workbook
    // handled these inconsistently (sometimes a partial total, sometimes blank); tScore reports
    // them and won't make results final until they're fixed. So: check the engine reports each
    // one, then compare everyone else.
    for (const n of incomplete) {
      expect(
        expected.some((e) => e.number === n),
        `rider ${n} missing from workbook`,
      ).toBe(true);
    }
    got = got.filter((e) => !incomplete.has(e.number));
    expected = expected.filter((e) => !incomplete.has(e.number));

    if (!golden.orderFromWorkbook) {
      got = [...got].sort(byNumber);
      expected = [...expected].sort(byNumber);
    }
    expect(got).toEqual(expected);
  });
});
