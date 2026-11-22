import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeResults } from './compute.js';
import { DEFAULT_SCORING, type EventInput } from './model.js';

const SCORE = fc.constantFrom(0, 1, 2, 3, 5);
const SECTIONS = 4;
const LAPS = 2;

/** Random one-class events: 1–12 competitive riders, every card in. */
const events = fc
  .array(
    fc.array(fc.array(SCORE, { minLength: SECTIONS, maxLength: SECTIONS }), {
      minLength: LAPS,
      maxLength: LAPS,
    }),
    {
      minLength: 1,
      maxLength: 12,
    },
  )
  .map((riders): EventInput => ({
    id: '00000000-0000-4000-8000-000000000000',
    code: 'PROP',
    name: 'Property test',
    days: [{ day: 1, date: '2027-01-01' }],
    scoring: DEFAULT_SCORING,
    classes: [
      { name: 'Open', order: 1, scored: true, days: [{ day: 1, sections: SECTIONS, laps: LAPS }] },
    ],
    entries: riders.map((_, i) => ({
      number: i + 1,
      riders: [{ givenName: 'Rider', familyName: String(i + 1) }],
      tier: 'competitive',
      status: 'riding',
      classes: ['Open'],
    })),
    cards: riders.flatMap((laps, i) =>
      laps.map((scores, l) => ({ number: i + 1, day: 1, lap: l + 1, scores })),
    ),
  }));

const OPTIONS = {
  generator: { name: 'tScore', version: 'test' },
  generatedAt: '2027-01-01T12:00:00+11:00',
  status: 'final' as const,
  revision: 1,
};
const entriesOf = (e: EventInput) => computeResults(e, OPTIONS).results.classes[0]!.entries;

describe('ranking properties', () => {
  it('never puts a higher total ahead of a lower one (normal trials)', () => {
    fc.assert(
      fc.property(events, (e) => {
        const totals = entriesOf(e).map((x) => x.total ?? 0);
        expect(totals).toEqual([...totals].sort((a, b) => a - b));
      }),
    );
  });

  it('places are 1-based, never decrease, and only repeat on a tie', () => {
    fc.assert(
      fc.property(events, (e) => {
        const es = entriesOf(e);
        es.forEach((x, i) => {
          if (i === 0) expect(x.position).toBe(1);
          else if (x.tied_with_previous) expect(x.position).toBe(es[i - 1]!.position);
          else expect(x.position).toBe(i + 1);
        });
      }),
    );
  });

  it('gives the same results whatever order riders and cards arrive in', () => {
    fc.assert(
      fc.property(events, fc.integer(), (e, seed) => {
        const shuffled: EventInput = {
          ...e,
          entries: shuffle(e.entries, seed),
          cards: shuffle(e.cards, seed + 1),
        };
        expect(computeResults(shuffled, OPTIONS).results).toEqual(
          computeResults(e, OPTIONS).results,
        );
      }),
    );
  });

  it('totals equal the sum of every section score', () => {
    fc.assert(
      fc.property(events, (e) => {
        for (const x of entriesOf(e)) {
          const cards = e.cards.filter((c) => c.number === x.number);
          expect(x.total).toBe(
            cards.flatMap((c) => c.scores).reduce<number>((a, b) => a + (b ?? 0), 0),
          );
        }
      }),
    );
  });
});

function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
