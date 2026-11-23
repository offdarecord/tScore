/**
 * Golden events: real events, anonymised, whose results the engine must reproduce.
 *
 * Each fixture in fixtures/golden/ holds the event input (classes, riders by number, cards) and,
 * per class, the totals and order from the club's scoring workbook or published results sheet.
 * Riders are identified only by number. Where a workbook was saved before its final sort
 * (`checkOrder: false`), only totals and statuses are checked, not order. Where a published
 * sheet was used, its order and place column ("1", "NA", "NC", "DNF", "DNS") are checked too.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeResults } from './compute.js';
import { DEFAULT_SCORING, type EventInput } from './model.js';

interface GoldenFixture {
  readonly event: Omit<EventInput, 'scoring'>;
  /** True when `expected` is in the official order (false: a workbook saved before sorting). */
  readonly checkOrder: boolean;
  /**
   * Per class, in the source's order: each rider's total, or "DNF" / "DNS", "NC" for a
   * non-competitive rider (total never published), or "INCOMPLETE" when the workbook left the
   * total blank because a card was missing.
   */
  readonly expected: Record<string, { number: number; total: number | string }[]>;
  /**
   * Per class, the order and place column of the published results sheet ("1", "2" … "NA",
   * "NC", "DNF", "DNS"), for riders matched to it. Missing when no published sheet was used.
   */
  readonly published?: Record<string, { number: number; place: string }[]>;
}

/** What a results sheet prints in the place column for an entry. */
function placeLabel(e: { tier: string; status: string; position: number | null }): string {
  if (e.tier === 'non_competitive') return 'NC';
  if (e.status === 'dnf') return 'DNF';
  if (e.status === 'dns') return 'DNS';
  if (e.tier === 'no_award') return 'NA';
  return String(e.position);
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
  const check = golden.checkOrder ? 'same order and totals' : 'same totals';

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
      'NA',
      'NC',
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

  it("holds only non-competitive riders' counts, not their real scores", () => {
    // Governing-body rule: NC scores are never published. The fixture keeps each NC rider's
    // scores as their counts only, sorted lowest first across their cards.
    const nc = golden.event.entries.filter((e) => e.tier === 'non_competitive');
    for (const e of nc) {
      const scores = golden.event.cards
        .filter((c) => c.number === e.number)
        .sort((a, b) => a.day - b.day || a.lap - b.lap)
        .flatMap((c) => c.scores.filter((v): v is number => v !== null));
      expect(scores, `rider ${e.number}`).toEqual([...scores].sort((a, b) => a - b));
    }
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
              : e.tier === 'non_competitive'
                ? 'NC'
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

    if (!golden.checkOrder) {
      got = [...got].sort(byNumber);
      expected = [...expected].sort(byNumber);
    }
    expect(got).toEqual(expected);
  });

  const published = Object.keys(golden.published ?? {});
  it.runIf(published.length > 0).each(published)(
    'class %s: same order and place column as the published results',
    (cls) => {
      let sheet = golden.published?.[cls] ?? [];
      const onSheet = new Set(sheet.map((p) => p.number));
      const entries = results.classes.find((c) => c.name === cls)?.entries ?? [];
      let got = entries
        .filter((e) => onSheet.has(e.number))
        .map((e) => ({ number: e.number, place: placeLabel(e) }));
      // A few riders on some sheets couldn't be matched to the event's cards (corrected after
      // the sheet was printed), which leaves gaps in the sheet's placings. Then compare the
      // matched riders' order and NA / NC / DNF / DNS labels, but not the placing numbers.
      const placings = sheet.filter((p) => /^\d+$/.test(p.place)).map((p) => Number(p.place));
      if (onSheet.size < entries.length || placings.some((n, i) => n !== i + 1)) {
        const unnumbered = (p: { number: number; place: string }) => ({
          number: p.number,
          place: /^\d+$/.test(p.place) ? '#' : p.place,
        });
        got = got.map(unnumbered);
        sheet = sheet.map(unnumbered);
      }
      expect(got).toEqual(sheet);
    },
  );
});
