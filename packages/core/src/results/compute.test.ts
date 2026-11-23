import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateResults } from '../results-validation.js';
import { computeResults, ResultsNotFinalError } from './compute.js';
import { DEMO_EVENT, DEMO_OPTIONS } from './demo-event.test-fixture.js';
import type { EntryInput, EventInput } from './model.js';

const EXAMPLE = JSON.parse(
  readFileSync(
    new URL('../../../../schemas/examples/results.one-day.json', import.meta.url),
    'utf8',
  ),
) as unknown;

const provisional = { ...DEMO_OPTIONS, status: 'provisional' as const };
const rider = (number: number, extra: Partial<EntryInput> = {}): EntryInput => ({
  number,
  riders: [{ givenName: 'Rider', familyName: String(number) }],
  tier: 'competitive',
  status: 'riding',
  classes: ['Open'],
  ...extra,
});
/** A one-class, one-day, 3 sections × 1 lap event with the given riders and scores. */
function small(
  scores: Record<number, (number | null)[]>,
  entries?: EntryInput[],
  extra: Partial<EventInput> = {},
): EventInput {
  return {
    ...DEMO_EVENT,
    classes: [{ name: 'Open', order: 1, scored: true, days: [{ day: 1, sections: 3, laps: 1 }] }],
    entries: entries ?? Object.keys(scores).map((n) => rider(Number(n))),
    cards: Object.entries(scores).map(([n, s]) => ({
      number: Number(n),
      day: 1,
      lap: 1,
      scores: s,
    })),
    ...extra,
  };
}
const placings = (input: EventInput) =>
  computeResults(input, provisional).results.classes[0]!.entries.map((e) => [e.number, e.position]);

describe('computeResults', () => {
  it('reproduces the results-format example exactly from raw cards (golden test)', () => {
    const { results, gaps } = computeResults(DEMO_EVENT, DEMO_OPTIONS);
    expect(gaps).toEqual([]);
    expect(results).toEqual(EXAMPLE);
  });

  it('produces payloads that pass the results validator', () => {
    const r = validateResults(computeResults(DEMO_EVENT, DEMO_OPTIONS).results);
    expect(r.ok ? [] : r.issues).toEqual([]);
  });

  it('leaves out classes that are not scored (minders)', () => {
    const names = computeResults(DEMO_EVENT, DEMO_OPTIONS).results.classes.map((c) => c.name);
    expect(names).toEqual(['Trial 2', 'Juniors', 'Sidecar']);
  });

  describe('provisional and final', () => {
    const missing: EventInput = {
      ...DEMO_EVENT,
      cards: DEMO_EVENT.cards.filter((c) => !(c.number === 2 && c.lap === 2)),
    };

    it('reports a missing card and shows the lap as not in', () => {
      const { results, gaps } = computeResults(missing, provisional);
      expect(gaps).toEqual([
        { kind: 'missing_card', number: 2, className: 'Trial 2', day: 1, lap: 2 },
      ]);
      const sam = results.classes[0]!.entries.find((e) => e.number === 2)!;
      expect(sam.days![0]!.laps[1]).toEqual({ lap: 2, total: null, sections: null });
      expect(results.status).toBe('provisional');
    });

    it('refuses to make results final while anything is missing', () => {
      expect(() => computeResults(missing, DEMO_OPTIONS)).toThrow(ResultsNotFinalError);
    });

    it('does not expect cards after a DNF', () => {
      expect(computeResults(DEMO_EVENT, DEMO_OPTIONS).gaps).toEqual([]);
    });

    it('reports an undecided score (waiting in review) and leaves it out of the total', () => {
      const { results, gaps } = computeResults(small({ 1: [1, null, 2] }), provisional);
      expect(gaps).toEqual([
        { kind: 'undecided_score', number: 1, className: 'Open', day: 1, lap: 1, section: 2 },
      ]);
      expect(results.classes[0]!.entries[0]!.total).toBe(3);
    });
  });

  describe('ranking', () => {
    it('splits a tie on total by most cleans', () => {
      expect(placings(small({ 1: [1, 1, 0], 2: [2, 0, 0] }))).toEqual([
        [2, 1],
        [1, 2],
      ]);
    });

    it('applies a fewest-5s tie-break when the ruleset asks for it', () => {
      // Both total 5: rider 1 has one 5, rider 2 has none.
      const input = small({ 1: [5, 0, 0], 2: [2, 3, 0] }, undefined, {
        scoring: { ...DEMO_EVENT.scoring, tieBreaks: ['total', 'fewest_5'] },
      });
      expect(placings(input)).toEqual([
        [2, 1],
        [1, 2],
      ]);
    });

    it('shares a placing on an exact tie and skips the next (1, 1, 3)', () => {
      const { results } = computeResults(
        small({ 1: [1, 0, 0], 2: [1, 0, 0], 3: [2, 0, 0] }),
        provisional,
      );
      const es = results.classes[0]!.entries;
      expect(es.map((e) => [e.number, e.position, e.tied_with_previous ?? false])).toEqual([
        [1, 1, false],
        [2, 1, true],
        [3, 3, false],
      ]);
    });

    it('lets a ride-off decide an exact tie', () => {
      const entries = [rider(1, { rideOff: { Open: 2 } }), rider(2, { rideOff: { Open: 1 } })];
      const { results } = computeResults(
        small({ 1: [1, 0, 0], 2: [1, 0, 0] }, entries),
        provisional,
      );
      expect(results.classes[0]!.entries.map((e) => [e.number, e.position, e.ride_off])).toEqual([
        [2, 1, 1],
        [1, 2, 2],
      ]);
    });

    it('ranks the highest total first in a gate trial', () => {
      const input = small({ 1: [1, 0, 0], 2: [5, 5, 0] }, undefined, {
        scoring: { ...DEMO_EVENT.scoring, direction: 'high_wins' },
      });
      expect(placings(input)).toEqual([
        [2, 1],
        [1, 2],
      ]);
    });

    it('orders competitive, then No award, then Non-competitive, each with its DNF then DNS riders, whatever the scores', () => {
      const entries = [
        rider(1, { tier: 'non_competitive' }),
        rider(2, { tier: 'no_award' }),
        rider(3),
        rider(4, { status: 'dnf' }),
        rider(5, { status: 'dns' }),
        rider(6, { tier: 'no_award', status: 'dns' }),
      ];
      const { results } = computeResults(
        small({ 1: [0, 0, 0], 2: [0, 0, 0], 3: [5, 5, 5], 4: [0, 0, 0] }, entries),
        provisional,
      );
      expect(
        results.classes[0]!.entries.map((e) => [e.number, e.position, e.rank_in_tier ?? null]),
      ).toEqual([
        [3, 1, null],
        [4, null, null],
        [5, null, null],
        [2, null, 1],
        [6, null, null],
        [1, null, 1],
      ]);
    });

    it("leaves a non-competitive rider's scores out of the results, keeping only counts", () => {
      const entries = [
        rider(1, { tier: 'non_competitive', penalties: [{ points: 5, reason: 'other' }] }),
      ];
      const { results } = computeResults(small({ 1: [1, 0, 5] }, entries), provisional);
      const e = results.classes[0]!.entries[0]!;
      expect(e.total).toBeNull();
      expect(e).not.toHaveProperty('days');
      expect(e).not.toHaveProperty('penalties');
      expect(e.counts).toEqual({ '0': 1, '1': 1, '2': 0, '3': 0, '5': 1 });
      expect(JSON.stringify(results)).not.toContain('"laps":[');
    });

    it('orders DNF riders by most cleans, not by total (as past club results do)', () => {
      const entries = [
        rider(1, { status: 'dnf' }),
        rider(2, { status: 'dnf' }),
        rider(3, { status: 'dnf' }),
      ];
      // Totals 2, 15, 6; cleans 1, 2, 0. Club order is by cleans: 2, 1, 3.
      const { results } = computeResults(
        small({ 1: [1, 1, 0], 2: [5, 0, 0], 3: [3, 3, null] }, entries),
        provisional,
      );
      expect(results.classes[0]!.entries.map((e) => e.number)).toEqual([2, 1, 3]);
    });

    it('lists riders with a card missing after those with every card in (provisional)', () => {
      const input: EventInput = {
        ...small({}),
        classes: [
          { name: 'Open', order: 1, scored: true, days: [{ day: 1, sections: 2, laps: 2 }] },
        ],
        entries: [rider(1), rider(2), rider(3)],
        cards: [
          { number: 1, day: 1, lap: 1, scores: [0, 0] }, // lap 2 not in yet: total 0 so far
          { number: 2, day: 1, lap: 1, scores: [5, 5] },
          { number: 2, day: 1, lap: 2, scores: [5, 5] },
          { number: 3, day: 1, lap: 1, scores: [1, 0] },
          { number: 3, day: 1, lap: 2, scores: [0, 0] },
        ],
      };
      const { results } = computeResults(input, provisional);
      expect(results.classes[0]!.entries.map((e) => [e.number, e.position])).toEqual([
        [3, 1],
        [2, 2],
        [1, 3],
      ]);
    });
  });

  describe('event features', () => {
    it('ignores a skipped section from its lap onwards', () => {
      const input: EventInput = {
        ...small({}),
        classes: [
          {
            name: 'Open',
            order: 1,
            scored: true,
            days: [{ day: 1, sections: 3, laps: 2, skipped: [{ section: 2, fromLap: 2 }] }],
          },
        ],
        entries: [rider(1)],
        cards: [
          { number: 1, day: 1, lap: 1, scores: [0, 5, 0] },
          { number: 1, day: 1, lap: 2, scores: [0, 5, 0] },
        ],
      };
      const { results, gaps } = computeResults(input, { ...DEMO_OPTIONS, privacy: {} });
      const e = results.classes[0]!.entries[0]!;
      expect(gaps).toEqual([]);
      expect(e.days![0]!.laps.map((l) => l.sections)).toEqual([
        [0, 5, 0],
        [0, null, 0],
      ]);
      expect(e.total).toBe(5);
      expect(results.classes[0]!.days[0]!.skipped).toEqual([{ section: 2, from_lap: 2 }]);
      const v = validateResults(results);
      expect(v.ok ? [] : v.issues).toEqual([]);
    });

    it('counts one set of cards in both classes for a second-class rider', () => {
      const input: EventInput = {
        ...small({}),
        classes: [
          { name: 'Open', order: 1, scored: true, days: [{ day: 1, sections: 3, laps: 1 }] },
          { name: 'Masters', order: 2, scored: true, days: [{ day: 1, sections: 3, laps: 1 }] },
        ],
        entries: [
          rider(1, {
            classes: ['Open', 'Masters'],
            penalties: [{ points: 5, reason: 'other', classes: ['Masters'] }],
          }),
        ],
        cards: [{ number: 1, day: 1, lap: 1, scores: [1, 0, 0] }],
      };
      const [open, masters] = computeResults(input, provisional).results.classes;
      expect(open!.entries[0]).toMatchObject({ total: 1, also_in: ['Masters'], penalties: [] });
      expect(masters!.entries[0]).toMatchObject({ total: 6, also_in: ['Open'] });
    });

    it('applies the junior surname rule only to the named classes', () => {
      const r = computeResults(DEMO_EVENT, DEMO_OPTIONS).results;
      expect(r.classes[0]!.entries[0]!.riders[0]!.name).toBe('Sam Sample');
      expect(r.classes[1]!.entries[0]!.riders[0]).toEqual({
        name: 'Riley M.',
        given_name: 'Riley',
        family_name: 'M.',
      });
      expect(r.privacy_applied).toEqual(['junior_surname_initial']);
    });
  });

  describe('bad input', () => {
    it('rejects a score that is not a score value', () => {
      expect(() => computeResults(small({ 1: [4, 0, 0] }), provisional)).toThrow(
        /4 is not a valid score/,
      );
    });
    it('rejects two cards for the same rider and lap', () => {
      const input = small({ 1: [0, 0, 0] });
      expect(() =>
        computeResults({ ...input, cards: [...input.cards, ...input.cards] }, provisional),
      ).toThrow(/Two cards/);
    });
    it('rejects an entry in an unknown class', () => {
      expect(() =>
        computeResults(small({}, [rider(1, { classes: ['Nope'] })]), provisional),
      ).toThrow(/unknown class/);
    });
    it('rejects an unknown tie-break', () => {
      const input = small({}, [], {
        scoring: { ...DEMO_EVENT.scoring, tieBreaks: ['total', 'loudest'] },
      });
      expect(() => computeResults(input, provisional)).toThrow(/Unknown tie-break/);
    });
  });
});
