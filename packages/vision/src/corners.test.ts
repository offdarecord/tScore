import { cardProfile, checkCardProfile, qrMatrix, qrPayload, type CardProfile } from '@tscore/core';
import { describe, expect, it } from 'vitest';
import { drawnBlankReference } from './blank-reference.js';
import {
  cornersFit,
  homography,
  project,
  readCardFromCorners,
  syntheticCorners,
  type CardCorners,
} from './corners.js';
import { readLabel } from './label.js';
import { readCard, readerProfile, REGIONAL_16, type CardReading } from './reader.js';
import { syntheticCard, type SyntheticCard } from './synthetic.js';

// The desk clicks a card's four corners (#106). Drawn cards and invented scores only.

const regional = cardProfile('regional-16') as CardProfile;
const scores = [0, 1, 2, 3, 5, 0, 0, 1, 5, 3, 2, 0, 1, 0, 0, 2];
const values = (c: CardReading) => c.rows.map((r) => r.value);

function fromCorners(
  card: SyntheticCard,
  profile: CardProfile = regional,
  nudge: (c: CardCorners) => CardCorners = (c) => c,
) {
  const reader = readerProfile(profile);
  const frame = syntheticCard(card, reader);
  const corners = nudge(syntheticCorners(profile, card));
  return {
    frame,
    result: readCardFromCorners(frame, corners, profile, reader, drawnBlankReference(reader)),
  };
}

describe('straightening a card from its corners', () => {
  it('maps each corner where it was clicked', () => {
    const from = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    const to = [
      { x: 105, y: 40 },
      { x: 300, y: 52 },
      { x: 320, y: 610 },
      { x: 90, y: 590 },
    ];
    const h = homography(from, to);
    expect(h).not.toBeNull();
    from.forEach((p, i) => {
      const q = project(h!, p);
      expect(q.x).toBeCloseTo(to[i]!.x, 6);
      expect(q.y).toBeCloseTo(to[i]!.y, 6);
    });
  });
});

describe('reading a card from the corners the desk clicks', () => {
  it.each([
    {},
    { angle: -12, columnWidth: 40 },
    { angle: 25, columnWidth: 36, width: 900, height: 900 },
    { angle: 3, columnWidth: 70, width: 1000, height: 1400 },
  ])('reads the regional card wherever it lies: %o', (placed) => {
    const { result } = fromCorners({ punches: scores.map((s) => [s]), ...placed });
    expect(result.ok && values(result.card)).toEqual(scores);
  });

  it('reads it the same as finding it by its column, label included', () => {
    const card: SyntheticCard = {
      punches: scores.map((s) => [s]),
      label: qrMatrix(qrPayload('EXAMPLE', 12, 1, 2)),
      angle: 6,
      shade: 0.3,
      noise: 10,
    };
    const { frame, result } = fromCorners(card);
    const auto = readCard(frame);
    expect(result.ok && auto.ok).toBe(true);
    if (!result.ok || !auto.ok) return;
    expect(values(result.card)).toEqual(values(auto.card));
    expect(readLabel(frame, result.card.pose)).toEqual(readLabel(frame, auto.card.pose));
    expect(readLabel(frame, result.card.pose)).toMatchObject({ number: 12, lap: 2 });
  });

  it('never reads a wrong score from corners clicked a little off', () => {
    let wrong = 0;
    for (let seed = 1; seed <= 12; seed++) {
      let s = seed * 104729;
      const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
      const jitter = (p: { x: number; y: number }) => ({
        x: p.x + (next() - 0.5) * 8,
        y: p.y + (next() - 0.5) * 8,
      });
      const truth = Array.from({ length: 16 }, () => REGIONAL_16.values[Math.floor(next() * 5)]!);
      const { result } = fromCorners(
        {
          punches: truth.map((t) => [t]),
          angle: (next() - 0.5) * 30,
          columnWidth: 36 + next() * 30,
          seed,
        },
        regional,
        (c) => ({
          topLeft: jitter(c.topLeft),
          topRight: jitter(c.topRight),
          bottomRight: jitter(c.bottomRight),
          bottomLeft: jitter(c.bottomLeft),
        }),
      );
      if (!result.ok) continue;
      result.card.rows.forEach((r, i) => {
        if (r.value !== null && r.value !== truth[i]) wrong++;
      });
    }
    expect(wrong).toBe(0);
  }, 60_000);

  it('reads a card with fewer rows, marked in ink, whose profile is read by corners', () => {
    const rows = 14;
    const units = 1.6 + (rows + 1) * 0.675 + 4.6;
    const profile = checkCardProfile({
      ...regional,
      id: 'example-14-ink',
      rows,
      card: { width_mm: 43, height_mm: Number((units * 9.773).toFixed(2)) },
      locator: 'manual-corners',
      marking_style: 'ink',
      thresholds: { ...regional.thresholds, mark: 0.35, confidence_gap: 0.12 },
      trust: 'assisted',
    });
    const truth = scores.slice(0, rows);
    const { result } = fromCorners(
      { punches: truth.map((s) => [s]), marking: 'ink', ink: 'blue', angle: -8 },
      profile,
    );
    expect(result.ok && values(result.card)).toEqual(truth);
  });

  it('refuses corners that cannot be the card, rather than misread it', () => {
    const card = { punches: scores.map((s) => [s]) };
    const c = syntheticCorners(regional, card);
    const frame = syntheticCard(card);
    const refused = (corners: CardCorners) =>
      readCardFromCorners(frame, corners, regional).ok === false;
    // Clicked in the wrong order: crossed.
    expect(refused({ ...c, topRight: c.bottomRight, bottomRight: c.topRight })).toBe(true);
    // Round the other way.
    expect(
      refused({
        topLeft: c.topRight,
        topRight: c.topLeft,
        bottomRight: c.bottomLeft,
        bottomLeft: c.bottomRight,
      }),
    ).toBe(true);
    // Off the picture.
    expect(refused({ ...c, topLeft: { x: -5, y: 10 } })).toBe(true);
    // The wrong shape: only the top half of the card.
    const midLeft = {
      x: (c.topLeft.x + c.bottomLeft.x) / 2,
      y: (c.topLeft.y + c.bottomLeft.y) / 2,
    };
    const midRight = {
      x: (c.topRight.x + c.bottomRight.x) / 2,
      y: (c.topRight.y + c.bottomRight.y) / 2,
    };
    expect(refused({ ...c, bottomLeft: midLeft, bottomRight: midRight })).toBe(true);
    // Corners on a picture with no card: no black mat round paper.
    const empty = syntheticCard({ punches: [], at: { x: 5, y: 5 } });
    expect(readCardFromCorners(empty, c, regional).ok).toBe(false);
    expect(cornersFit(c, regional.card, frame)).toBe(true);
  });

  it('needs the profile to say where its grid sits on the card', () => {
    const profile = structuredClone(regional);
    delete profile.grid.on_card;
    const frame = syntheticCard({ punches: [] });
    expect(readCardFromCorners(frame, syntheticCorners(regional), profile)).toEqual({
      ok: false,
      reason: 'NO_CARD',
    });
  });
});
