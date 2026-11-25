import { qrMatrix, qrPayload } from '@tscore/core';
import { describe, expect, it } from 'vitest';
import { parseLabel, readLabel } from './label.js';
import { readCard } from './reader.js';
import { syntheticCard } from './synthetic.js';

describe('the rider label', () => {
  it('parses our QR text and nothing else', () => {
    expect(parseLabel('TS1;E=WR1;R=17;D=1;L=3')).toEqual({
      event: 'WR1',
      number: 17,
      day: 1,
      lap: 3,
    });
    expect(parseLabel('https://example.com')).toBeNull();
    expect(parseLabel('TS1;E=wr1;R=17;D=1;L=3')).toBeNull();
  });

  it.each([0, -10, 15])('reads the label above the grid on a card at %i°', (angle) => {
    const frame = syntheticCard({
      punches: [],
      label: qrMatrix(qrPayload('WR1', 42, 1, 2)),
      angle,
      columnWidth: 44,
      width: 900,
      height: 1200,
    });
    const card = readCard(frame);
    expect(card.ok).toBe(true);
    expect(readLabel(frame, card.ok ? card.card.pose : undefined)).toEqual({
      event: 'WR1',
      number: 42,
      day: 1,
      lap: 2,
    });
  });

  it('says so when there is no label', () => {
    const frame = syntheticCard({ punches: [] });
    const card = readCard(frame);
    expect(readLabel(frame, card.ok ? card.card.pose : undefined)).toBeNull();
  });
});
