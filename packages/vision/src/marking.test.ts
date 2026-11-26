import {
  cardProfile,
  checkCardProfile,
  MARKING_STYLE_THRESHOLDS,
  type CardProfile,
  type MarkingStyle,
} from '@tscore/core';
import { describe, expect, it } from 'vitest';
import {
  blankReferenceFor,
  drawnBlankReference,
  paperReference,
  type BlankReference,
} from './blank-reference.js';
import type { Channel } from './image.js';
import { readCard, readerProfile, REGIONAL_16, type ReaderProfile } from './reader.js';
import { syntheticCard, type InkColour, type SyntheticCard } from './synthetic.js';

// Cells are read as change from the blank card (#104). Drawn cards only: invented scores, and
// the blank regional card is drawn from its profile's geometry, never photographed.

const regional = cardProfile('regional-16') as CardProfile;
const VALUES = REGIONAL_16.values;

/** A card like the regional one, marked another way, with that style's starting thresholds. */
function marked(style: MarkingStyle, channel?: Channel): CardProfile {
  const defaults = MARKING_STYLE_THRESHOLDS[style];
  return checkCardProfile({
    ...regional,
    id: `regional-16-${style}`,
    marking_style: style,
    // A pen-hole card measures a pen-hole-sized area.
    grid: { ...regional.grid, cell_radius: style === 'pen-hole' ? 0.1 : regional.grid.cell_radius },
    thresholds: {
      ...regional.thresholds,
      ...defaults,
      colour_channel: channel ?? defaults.colour_channel,
    },
    trust: 'assisted',
  });
}

/** Random cards (angle, size, light, noise, paper), read: how many rows were wrong or flagged. */
function bench(
  profile: ReaderProfile,
  reference: BlankReference,
  card: Partial<SyntheticCard>,
  cards = 12,
) {
  let wrong = 0;
  let flagged = 0;
  let rows = 0;
  let refused = 0;
  for (let seed = 1; seed <= cards; seed++) {
    let s = seed * 7919;
    const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const truth = Array.from({ length: 16 }, () => VALUES[Math.floor(next() * VALUES.length)]!);
    const result = readCard(
      syntheticCard(
        {
          punches: truth.map((t) => [t]),
          angle: (next() - 0.5) * 40,
          columnWidth: 34 + next() * 40,
          shade: next() * 0.5,
          noise: next() * 20,
          paper: 190 + next() * 60,
          seed,
          width: 900,
          height: 1300,
          ...card,
        },
        profile,
      ),
      profile,
      reference,
    );
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
  return { wrong, flagged: flagged / Math.max(1, rows), refused };
}

describe('the blank card reference', () => {
  it('is drawn for the regional card from its own geometry', () => {
    const ref = blankReferenceFor(REGIONAL_16);
    expect(ref.profile).toBe('regional-16');
    expect(ref.levels).toEqual(drawnBlankReference(REGIONAL_16).levels);
    expect(ref.levels.length).toBe(16 * 5 * ref.points.length);
    // The printed digit runs through the middle of every cell; the rest is paper.
    const centre = ref.points.findIndex((p) => Math.abs(p.du) + Math.abs(p.dv) < 1e-9);
    const edge = ref.points.findIndex((p) => p.dv > 0.14);
    expect(ref.levels[centre]).toBeLessThan(0.35);
    expect(ref.levels[edge]).toBeCloseTo(1, 5);
  });

  it('is plain paper for a card tScore has not been shown blank', () => {
    const other = readerProfile(marked('ink'));
    expect([...blankReferenceFor(other).levels].every((l) => l === 1)).toBe(true);
  });

  it('reads punched cards exactly as measuring darkness did', () => {
    const scores = [0, 1, 2, 3, 5, 0, 0, 1, 5, 3, 2, 0, 1, 0, 0, 2];
    const frame = syntheticCard({ punches: scores.map((s) => [s]), angle: 7, shade: 0.3 });
    const drawn = readCard(frame);
    const paper = readCard(frame, REGIONAL_16, paperReference(REGIONAL_16));
    expect(drawn.ok && drawn.card.rows.map((r) => r.value)).toEqual(scores);
    expect(paper.ok && paper.card.rows.map((r) => r.value)).toEqual(scores);
  });
});

describe('starting thresholds for each marking style', () => {
  it('keeps the regional card’s tuned values for punched cards', () => {
    expect(MARKING_STYLE_THRESHOLDS.punch).toEqual({
      mark: regional.thresholds.mark,
      confidence_gap: regional.thresholds.confidence_gap,
      colour_channel: regional.thresholds.colour_channel,
    });
  });

  it('keeps pen and ink cards assisted until they are tuned on real cards (#129)', () => {
    expect(() => checkCardProfile({ ...marked('ink'), trust: 'trusted' })).toThrow(/assisted/);
    expect(() => checkCardProfile({ ...marked('pen-hole'), trust: 'trusted' })).toThrow(/assisted/);
    const real = {
      ...marked('ink'),
      trust: 'trusted' as const,
      thresholds: {
        ...marked('ink').thresholds,
        tuned_from: { ...regional.thresholds.tuned_from, source: 'real' as const },
      },
    };
    expect(() => checkCardProfile(real)).not.toThrow();
  });
});

describe('reading pen holes and ink', () => {
  it('never counts a printed digit as a mark', () => {
    for (const style of ['pen-hole', 'ink'] as const) {
      const profile = readerProfile(marked(style));
      const frame = syntheticCard({ punches: [], marking: style }, profile);
      const drawn = readCard(frame, profile, drawnBlankReference(profile));
      expect(drawn.ok).toBe(true);
      if (!drawn.ok) continue;
      expect(drawn.card.rows.every((r) => r.flag === 'NO_PUNCH')).toBe(true);
      expect(Math.max(...drawn.card.rows.flatMap((r) => r.darkness))).toBeLessThan(0.1);
      // Measured as plain darkness, the digit alone would look an eighth marked or more.
      const plain = readCard(frame, profile, paperReference(profile));
      expect(plain.ok && Math.min(...plain.card.rows.flatMap((r) => r.darkness))).toBeGreaterThan(
        0.1,
      );
    }
  });

  it.each(['black', 'blue', 'red'] as const)(
    'reads %s ink, with no wrong scores',
    (ink) => {
      const profile = readerProfile(marked('ink'));
      const r = bench(profile, drawnBlankReference(profile), { marking: 'ink', ink });
      expect(r.wrong).toBe(0);
      expect(r.refused).toBeLessThanOrEqual(1);
      expect(r.flagged).toBeLessThan(0.1);
    },
    120_000,
  );

  it('reads blue ink in the red channel, and red ink there is never a wrong score', () => {
    const profile = readerProfile(marked('ink', 'red'));
    const reference = drawnBlankReference(profile);
    const blue = bench(profile, reference, { marking: 'ink', ink: 'blue' as InkColour }, 6);
    expect(blue.wrong).toBe(0);
    expect(blue.flagged).toBeLessThan(0.1);
    // Red ink barely shows in red: rows go to a person, never to a wrong score.
    const red = bench(profile, reference, { marking: 'ink', ink: 'red' as InkColour }, 6);
    expect(red.wrong).toBe(0);
    expect(red.flagged).toBeGreaterThan(0.9);
  }, 120_000);

  it('reads pen holes, with no wrong scores', () => {
    const profile = readerProfile(marked('pen-hole'));
    const r = bench(profile, drawnBlankReference(profile), { marking: 'pen-hole' }, 20);
    expect(r.wrong).toBe(0);
    expect(r.refused).toBeLessThanOrEqual(1);
    // Small, ragged holes are less clear than punches: more go to a person.
    expect(r.flagged).toBeLessThan(0.25);
  }, 120_000);
});
