import { describe, expect, it } from 'vitest';
import { readCard, REGIONAL_16, type CardReading } from './reader.js';
import { syntheticCard, type SyntheticCard } from './synthetic.js';

// Synthetic cards only (invented scores). Real card photos are checked locally, never committed.

const VALUES = REGIONAL_16.values;

/** A card with one score per section, from a list of values. */
function scored(scores: readonly number[], extra: Partial<SyntheticCard> = {}): SyntheticCard {
  return { punches: scores.map((s) => [s]), ...extra };
}

function read(card: SyntheticCard): CardReading {
  const r = readCard(syntheticCard(card));
  if (!r.ok) throw new Error(`no card: ${r.reason}`);
  return r.card;
}

const values = (c: CardReading) => c.rows.map((r) => r.value);

describe('reading a regional card', () => {
  const scores = [0, 1, 2, 3, 5, 0, 0, 1, 5, 3, 2, 0, 1, 0, 0, 2];

  it('reads every row of a square-on card', () => {
    const card = read(scored(scores));
    expect(values(card)).toEqual(scores);
    expect(card.rows.every((r) => !r.flag && !r.inverse)).toBe(true);
  });

  it.each([
    { angle: -12, columnWidth: 40 },
    { angle: 8, columnWidth: 52, at: { x: 0.45, y: 0.5 } },
    { angle: 25, columnWidth: 36, width: 900, height: 900 },
    { angle: 3, columnWidth: 70, width: 1000, height: 1400 },
  ])('reads it wherever it lies: %o', (placed) => {
    expect(values(read(scored(scores, placed)))).toEqual(scores);
  });

  it('copes with uneven light, dull paper and camera noise', () => {
    const card = read(scored(scores, { shade: 0.5, paper: 200, noise: 18, seed: 7, angle: -6 }));
    expect(values(card)).toEqual(scores);
  });

  it('reads an inverse correction (every value but one punched) and tags it', () => {
    const punches = scores.map((s) => [s]);
    punches[4] = VALUES.filter((v) => v !== 3);
    const row = read({ punches }).rows[4]!;
    expect(row).toMatchObject({ value: 3, inverse: true });
    expect(row.flag).toBeUndefined();
  });

  it('flags rows a person must decide, and never guesses', () => {
    const punches: number[][] = scores.map((s) => [s]);
    punches[0] = []; // missed by the observer
    punches[1] = [1, 2]; // part-way correction
    punches[2] = [...VALUES]; // every value
    const card = read({ punches, torn: [[], [], [], [0]] });
    expect(card.rows.slice(0, 3).map((r) => [r.value, r.flag])).toEqual([
      [null, 'NO_PUNCH'],
      [null, 'MULTI_PUNCH'],
      [null, 'MULTI_PUNCH'],
    ]);
    // Row 4 has a clean 3 and a torn, partly open 0: unclear, so a person looks at it.
    expect(card.rows[3]!.value === 3 && !card.rows[3]!.flag).toBe(false);
  });

  it('says why when there is no card, or it is cut off', () => {
    const blank = syntheticCard({ punches: [], at: { x: 5, y: 5 } });
    expect(readCard(blank)).toEqual({ ok: false, reason: 'NO_CARD' });
    const cut = syntheticCard({ punches: [], at: { x: 0.5, y: 0.05 } });
    expect(readCard(cut)).toMatchObject({ ok: false });
  });

  it('never auto-accepts a wrong score across many random cards (the ground rule)', () => {
    let wrong = 0;
    let flagged = 0;
    let rows = 0;
    let refused = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let s = seed * 9301;
      const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const truth = Array.from({ length: 16 }, () => VALUES[Math.floor(next() * VALUES.length)]!);
      const result = readCard(
        syntheticCard(
          scored(truth, {
            angle: (next() - 0.5) * 40,
            columnWidth: 34 + next() * 40,
            shade: next() * 0.5,
            noise: next() * 20,
            paper: 190 + next() * 60,
            seed,
            width: 900,
            height: 1300,
          }),
        ),
      );
      // Refusing a frame is safe: the desk just holds the card a moment longer.
      if (!result.ok) {
        refused++;
        continue;
      }
      result.card.rows.forEach((r, i) => {
        rows++;
        if (r.value === null) flagged++;
        else if (r.value !== truth[i]) wrong++;
      });
    }
    expect(wrong).toBe(0);
    expect(refused).toBeLessThanOrEqual(2);
    expect(flagged / rows).toBeLessThan(0.05);
  }, 120_000);
});
