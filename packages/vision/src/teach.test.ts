import { checkCardProfile, MARKING_STYLE_THRESHOLDS, type MarkingStyle } from '@tscore/core';
import { describe, expect, it } from 'vitest';
import { readerProfile } from './reader.js';
import {
  blankReferenceFromStraight,
  checkThresholds,
  CELL_MM,
  findColumnOnBlank,
  gridFromColumn,
  practiceCard,
  proposeThresholds,
  readTeachCard,
  startingColumns,
  straightenCard,
  taughtProfile,
  verdictOf,
  type TaughtCard,
  type TeachLayout,
} from './teach.js';

// Teaching the drawn regional card as if it were a club's own card (#107). Invented cards only.

const CARD = { width_mm: 43, height_mm: 173 };

function teach(style: MarkingStyle, locator: TeachLayout['locator'] = 'black-column') {
  const blank = practiceCard(0, style);
  const pose = findColumnOnBlank(blank.frame, 16);
  expect(pose).not.toBeNull();
  const grid = gridFromColumn(pose!, blank.corners, CARD);
  expect(grid).not.toBeNull();
  const straight = straightenCard(blank.frame, blank.corners, CARD);
  expect(straight).not.toBeNull();
  const layout: TeachLayout = {
    id: 'example-club-16',
    name: 'Example club card',
    card: CARD,
    rows: 16,
    locator,
    grid: grid!,
    columns: startingColumns(grid!),
    cell_mm: CELL_MM[style],
    marking_style: style,
    correction_rules: 'inverse-all-but-one',
  };
  const start = MARKING_STYLE_THRESHOLDS[style];
  const draft = taughtProfile(layout, {
    ...start,
    tuned_from: { source: 'synthetic', cards: 0, rows: 0, rows_read: 0, wrong_auto_accepts: 0 },
  });
  const reference = blankReferenceFromStraight(straight!, draft);
  const cards: TaughtCard[] = [];
  for (let seed = 1; seed <= 5; seed++) {
    const c = practiceCard(seed, style);
    const r = readTeachCard(
      c.frame,
      draft,
      reference,
      locator === 'manual-corners' ? c.corners : undefined,
    );
    if (!r.ok) throw new Error(`card ${seed}: ${r.reason}`);
    cards.push({ darkness: r.card.rows.map((row) => row.darkness), answers: c.answers });
  }
  return { grid: grid!, draft, cards, reader: readerProfile(draft) };
}

describe('teach a card', () => {
  it('finds the black column on the blank card, where the regional card has it', () => {
    const { grid } = teach('punch');
    expect(grid.origin_x_mm).toBeCloseTo(19.06, 0);
    expect(grid.origin_y_mm).toBeCloseTo(15.64, 0);
    expect(grid.unit_mm).toBeGreaterThan(9.3);
    expect(grid.unit_mm).toBeLessThan(10.3);
    expect(grid.row_mm / grid.unit_mm).toBeCloseTo(0.675, 1);
  });

  for (const style of ['punch', 'pen-hole', 'ink'] as const) {
    it(`proposes thresholds that read every ${style} card right`, () => {
      const { cards, reader } = teach(style);
      const p = proposeThresholds(cards, reader, style);
      expect(p.check.wrong).toBe(0);
      expect(p.check.right).toBe(p.check.rows);
      expect(p.check.rows).toBe(5 * 16);
      expect(p.confidence_gap).toBeGreaterThanOrEqual(
        MARKING_STYLE_THRESHOLDS[style].confidence_gap / 2,
      );
    });
  }

  it('reads from the corners marked on each card', () => {
    const { cards, reader } = teach('punch', 'manual-corners');
    const p = proposeThresholds(cards, reader, 'punch');
    expect(p.check.wrong).toBe(0);
    expect(p.check.right).toBe(p.check.rows);
  });

  it('counts a row the club corrected as wrong, so the profile shows it', () => {
    const { cards, reader } = teach('punch');
    const first = cards[0]!;
    const changed: TaughtCard = {
      ...first,
      answers: first.answers.map((a, k) => (k === 0 ? (a === 5 ? 0 : 5) : a)),
    };
    const check = checkThresholds([changed, ...cards.slice(1)], reader, {
      mark: 0.55,
      confidence_gap: 0.2,
    });
    expect(check.wrong).toBe(1);
    expect(check.readings[0]?.[0]?.verdict).toBe('wrong');
  });

  it("doesn't send most rows to a person over one mistyped answer", () => {
    const { cards, reader } = teach('punch');
    const first = cards[0]!;
    const typo: TaughtCard = {
      ...first,
      answers: first.answers.map((a, k) => (k === 0 ? (a === 5 ? 0 : 5) : a)),
    };
    // Three cards, as few as the wizard takes: a typo there once dragged the mark to 0.08.
    const p = proposeThresholds([typo, ...cards.slice(1, 3)], reader, 'punch');
    expect(p.check.right).toBe(p.check.rows - 1);
    expect(p.check.readings[0]?.[0]?.verdict).not.toBe('right');
  });

  it('makes a profile that passes the profile rules, always assisted', () => {
    const { draft } = teach('ink');
    const profile = checkCardProfile(draft);
    expect(profile.trust).toBe('assisted');
    expect(profile.grid.on_card).toBeDefined();
    expect(profile.columns.map((c) => c.score)).toEqual([0, 1, 2, 3, 5]);
  });

  it('a row with no mark is right only when read as empty', () => {
    const empty = { section: 1, darkness: [0, 0, 0], punched: [false, false, false] };
    expect(
      verdictOf({ ...empty, value: null, inverse: false, flag: 'NO_PUNCH', margin: 1 }, null),
    ).toBe('right');
    expect(
      verdictOf({ ...empty, value: null, inverse: false, flag: 'LOW_CONF', margin: 0 }, null),
    ).toBe('person');
    expect(verdictOf({ ...empty, value: 2, inverse: false, margin: 1 }, null)).toBe('wrong');
  });
});
