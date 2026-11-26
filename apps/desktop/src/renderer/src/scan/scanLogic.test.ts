import { cardProfile, checkCardProfile, type CardProfile } from '@tscore/core';
import { readCard, syntheticCard, type CardReading } from '@tscore/vision';
import { describe, expect, it } from 'vitest';
import type { CardRow, DeskRider } from '../../../shared/ipc';
import { fromLabel, nextLap, SteadyGate, verdict } from './scanLogic';

// Invented riders only.

const REGIONAL = cardProfile('regional-16') as CardProfile;
/** The same card, described as an assisted profile (an invented one, as a new state's would be). */
const ASSISTED = checkCardProfile({ ...REGIONAL, id: 'assisted-16', trust: 'assisted' });

const rider: DeskRider = {
  number: 12,
  riders: [{ givenName: 'Avery', familyName: 'Stone' }],
  competitionStatus: 'competitive',
  status: 'riding',
  classes: ['Trial 3'],
  rides: { 1: { sections: 10, laps: 3 } },
};

function reading(punches: number[][]): CardReading {
  const r = readCard(syntheticCard({ punches, width: 600, height: 860, columnWidth: 34 }));
  if (!r.ok) throw new Error(r.reason);
  return r.card;
}

const ten = (v: number) => Array.from({ length: 10 }, () => [v]);
const card = (lap: number): CardRow => ({
  number: 12,
  day: 1,
  lap,
  scores: [],
  receivedAt: '2027-02-06T10:00:00+11:00',
  source: 'scan',
  edited: false,
});

describe('the scan desk', () => {
  it('waits for the same reading three frames running', () => {
    const gate = new SteadyGate();
    const a = reading(ten(0));
    expect(gate.push(a)).toBe(false);
    expect(gate.push(a)).toBe(false);
    expect(gate.push(a)).toBe(true);
    expect(gate.push(null)).toBe(false);
  });

  it('saves a clear card straight away, scores for the class’s sections only', () => {
    const v = verdict(
      reading(ten(1)),
      { number: 12, day: 1, lap: 1, from: 'label' },
      [rider],
      [],
      REGIONAL,
    );
    expect(v).toMatchObject({ kind: 'save', scores: Array(10).fill(1) });
  });

  it('sends a card with an unclear row to review, with the reason', () => {
    const punches = ten(0);
    punches[3] = [1, 2];
    const v = verdict(
      reading(punches),
      { number: 12, day: 1, lap: 2, from: 'typed' },
      [rider],
      [],
      REGIONAL,
    );
    expect(v.kind).toBe('review');
    if (v.kind === 'review') {
      expect(v.scores[3]).toBeNull();
      expect(v.reasons[3]).toBe('MULTI_PUNCH');
    }
  });

  it('notices a punch past the class’s sections', () => {
    const punches = ten(0);
    punches[12] = [3];
    const v = verdict(
      reading(punches),
      { number: 12, day: 1, lap: 1, from: 'label' },
      [rider],
      [],
      REGIONAL,
    );
    expect(v).toMatchObject({ kind: 'review', extraRows: [13] });
  });

  it('refuses a card already in, an unknown rider, or a lap the class does not ride', () => {
    const r = reading(ten(0));
    expect(
      verdict(r, { number: 12, day: 1, lap: 1, from: 'label' }, [rider], [card(1)], REGIONAL),
    ).toMatchObject({
      kind: 'problem',
      message: expect.stringContaining('already in'),
    });
    expect(
      verdict(r, { number: 99, day: 1, lap: 1, from: 'typed' }, [rider], [], REGIONAL).kind,
    ).toBe('problem');
    expect(
      verdict(r, { number: 12, day: 1, lap: 4, from: 'typed' }, [rider], [], REGIONAL).kind,
    ).toBe('problem');
  });

  it('never saves an assisted profile’s card by itself: a person confirms every one', () => {
    const id = { number: 12, day: 1, lap: 1, from: 'label' } as const;
    const v = verdict(reading(ten(2)), id, [rider], [], ASSISTED);
    expect(v).toMatchObject({
      kind: 'review',
      confirm: true,
      scores: Array(10).fill(2),
      reasons: Array(10).fill(null),
      extraRows: [],
    });
    // The same reading on the trusted regional card is saved straight away.
    expect(verdict(reading(ten(2)), id, [rider], [], REGIONAL).kind).toBe('save');
  });

  it('keeps an assisted card’s unclear rows for the review queue, not for confirming', () => {
    const punches = ten(0);
    punches[3] = [1, 2];
    const v = verdict(
      reading(punches),
      { number: 12, day: 1, lap: 1, from: 'label' },
      [rider],
      [],
      ASSISTED,
    );
    expect(v).toMatchObject({ kind: 'review', confirm: false });
    if (v.kind === 'review') expect(v.reasons[3]).toBe('MULTI_PUNCH');
  });

  it('never auto-accepts any reading of an assisted card', () => {
    const id = { number: 12, day: 1, lap: 1, from: 'label' } as const;
    for (const value of [0, 1, 2, 3, 5]) {
      const r = reading(ten(value));
      expect(verdict(r, id, [rider], [], ASSISTED).kind).toBe('review');
    }
  });

  it('expects the next lap not in yet, and trusts only this event’s labels', () => {
    expect(nextLap(rider, 1, [card(1)])).toBe(2);
    expect(fromLabel({ event: 'WR1', number: 12, day: 1, lap: 2 }, 'WR1')).toMatchObject({
      lap: 2,
    });
    expect(fromLabel({ event: 'OTHER', number: 12, day: 1, lap: 2 }, 'WR1')).toBeNull();
  });
});
