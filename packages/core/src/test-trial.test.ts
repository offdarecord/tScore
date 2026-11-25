import { describe, expect, it } from 'vitest';
import { newEventSetup } from './setup-defaults.js';
import {
  checkTestTrial,
  isTestTrialKey,
  PRACTICE_CARD_MM,
  TEST_TRIAL_EVENT,
  TEST_TRIAL_RIDERS,
  testTrialKey,
  type CheckCard,
} from './test-trial.js';

const riders = TEST_TRIAL_RIDERS.map((r, i) => ({ ...r, number: i + 1 }));
const recordedFromKey = (): CheckCard[] =>
  testTrialKey().cards.map((c) => ({
    number: TEST_TRIAL_RIDERS.findIndex((r) => r.givenName === c.givenName) + 1,
    day: c.day,
    lap: c.lap,
    scores: [...c.scores],
  }));

describe('the Test trial kit', () => {
  it('has a card for every rider and lap, with every value used in every section', () => {
    const key = testTrialKey();
    expect(isTestTrialKey(key)).toBe(true);
    expect(key.cards).toHaveLength(TEST_TRIAL_RIDERS.length * TEST_TRIAL_EVENT.laps);
    for (let s = 0; s < TEST_TRIAL_EVENT.sections; s++) {
      const used = new Set(key.cards.map((c) => c.scores[s]));
      expect([...used].sort()).toEqual([0, 1, 2, 3, 5]);
    }
    expect(testTrialKey()).toEqual(key);
  });

  it("uses the default setup's class names", () => {
    const classes = newEventSetup('2027-01-01').classes.map((c) => c.name);
    for (const r of TEST_TRIAL_RIDERS) expect(classes).toContain(r.className);
  });

  it('prints cards at the regional card size', () => {
    expect(PRACTICE_CARD_MM.width).toBe(43);
    expect(PRACTICE_CARD_MM.height).toBe(145);
    // 16 rows plus the header cell, 0.675 column widths each, fit between grid bottom and label.
    const gridTop = PRACTICE_CARD_MM.gridBottom + 17 * 0.675 * PRACTICE_CARD_MM.unit;
    expect(PRACTICE_CARD_MM.height - gridTop).toBeGreaterThan(21.2);
  });
});

describe('checking a rehearsal against the key', () => {
  it('says every card was read correctly', () => {
    const r = checkTestTrial(testTrialKey(), riders, recordedFromKey());
    expect(r.right).toBe(24);
    expect(r.cards).toBe(24);
    expect(r.hints).toEqual([]);
  });

  it('names a wrong cell, a missing card and an undecided score', () => {
    const cards = recordedFromKey();
    const wrong = cards[0]!;
    cards[0] = { ...wrong, scores: wrong.scores.map((s, i) => (i === 2 ? (s === 5 ? 3 : 5) : s)) };
    cards[1] = { ...cards[1]!, scores: [null, ...cards[1]!.scores.slice(1)] };
    cards.pop();
    const r = checkTestTrial(testTrialKey(), riders, cards);
    expect(r.right).toBe(21);
    expect(r.results[0]).toMatchObject({ outcome: 'wrong', name: 'Avery Practice', lap: 1 });
    expect(r.results[0]!.wrong).toEqual([
      { section: 3, expected: testTrialKey().cards[0]!.scores[2], read: expect.any(Number) },
    ]);
    expect(r.results[1]!.wrong[0]).toMatchObject({ section: 1, read: null });
    expect(r.results.at(-1)).toMatchObject({ outcome: 'missing' });
    expect(r.hints.join(' ')).toMatch(/missing/);
    expect(r.hints.join(' ')).toMatch(/undecided/);
    expect(r.hints.join(' ')).toMatch(/glare/);
  });

  it('points at framing when the mistakes sit in one section', () => {
    const cards = recordedFromKey().map((c, i) =>
      i < 4 ? { ...c, scores: c.scores.map((s, k) => (k === 5 ? (s === 0 ? 5 : 0) : s)) } : c,
    );
    const r = checkTestTrial(testTrialKey(), riders, cards);
    expect(r.hints[0]).toMatch(/section 6: the card may be cut off/);
  });

  it('says when the riders were never imported', () => {
    const r = checkTestTrial(testTrialKey(), [], []);
    expect(r.right).toBe(0);
    expect(r.hints[0]).toMatch(/import the kit's entry list/);
  });
});
