import { cardProfile, type CardProfile } from '@tscore/core';
import { describe, expect, it } from 'vitest';
import { toGrey } from './image.js';
import { MIN_MARGIN, PUNCH_THRESHOLD, readCard, readerProfile, REGIONAL_16 } from './reader.js';
import { decodeRow } from './row-decision.js';
import { syntheticCard } from './synthetic.js';

// The reader takes its card from a profile (presets/card-profiles/, #105). Invented cards only.

const regional = cardProfile('regional-16') as CardProfile;

describe('reading from a card profile', () => {
  it('reads the regional card with the geometry and thresholds it always used', () => {
    expect(REGIONAL_16).toEqual({
      id: 'regional-16',
      rows: 16,
      values: [0, 1, 2, 3, 5],
      cellOffsets: [-1.53, -1.01, 0.99, 1.52, 2.02],
      pitch: 0.675,
      cellRadius: 0.15,
      markThreshold: 0.55,
      minMargin: 0.2,
      channel: 'luma',
      inverseCorrections: true,
    });
    expect([PUNCH_THRESHOLD, MIN_MARGIN]).toEqual([0.55, 0.2]);
  });

  it('refuses a card it cannot find or read yet', () => {
    expect(() => readerProfile({ ...regional, locator: 'card-edges' })).toThrow(/can't be read/);
    expect(() => readerProfile({ ...regional, locator: 'corner-markers' })).toThrow(
      /can't be read/,
    );
  });

  it('reads all-but-one holes as a correction only where the card allows it', () => {
    const punches = Array.from({ length: 16 }, () => [0]);
    punches[2] = [0, 1, 2, 5]; // every value but 3
    const card = syntheticCard({ punches });
    const inverse = readCard(card);
    expect(inverse.ok && inverse.card.rows[2]).toMatchObject({ value: 3, inverse: true });
    const none = readCard(card, readerProfile({ ...regional, correction_rules: 'none' }));
    expect(none.ok && none.card.rows[2]).toMatchObject({ value: null, flag: 'MULTI_PUNCH' });
    expect(decodeRow([0, 1, 2], [true, true, false], { inverse: false })).toEqual({
      kind: 'flag',
      flag: 'MULTI_PUNCH',
    });
  });

  it('measures darkness in the colour the profile names', () => {
    const img = { width: 1, height: 1, data: new Uint8ClampedArray([200, 100, 50, 255]) };
    expect([...toGrey(img).data]).toEqual([124]);
    expect([...toGrey(img, 'red').data]).toEqual([200]);
    expect([...toGrey(img, 'green').data]).toEqual([100]);
    expect([...toGrey(img, 'blue').data]).toEqual([50]);
  });
});
