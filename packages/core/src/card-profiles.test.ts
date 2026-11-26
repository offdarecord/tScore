import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CARD_PROFILES,
  canAutoAccept,
  cardProfile,
  checkCardProfile,
  DEFAULT_CARD_PROFILE,
  type CardProfile,
} from './card-profiles.js';
import { CARD_PROFILE_ROWS } from './setup-validation.js';

const dir = join(import.meta.dirname, '../../../presets/card-profiles');
const regional = cardProfile('regional-16') as CardProfile;

/** A profile that uses every field, invented for the test. */
const EVERY_FIELD: CardProfile = {
  schema: 'tscore.card_profile/1',
  id: 'example-12',
  name: 'Example card, 12 sections',
  card: { width_mm: 60, height_mm: 150 },
  rows: 12,
  grid: { unit: 'column-width', row_pitch: 0.8, cell_radius: 0.2 },
  columns: [
    { score: 5, across: -2 },
    { score: 3, across: -1.4 },
    { score: 0, across: 1 },
    { score: 1, across: 1.5 },
    { score: 2, across: 2 },
  ],
  locator: 'corner-markers',
  marking_style: 'pen-hole',
  correction_rules: 'crossed-out',
  thresholds: {
    mark: 0.5,
    confidence_gap: 0.25,
    colour_channel: 'red',
    tuned_from: {
      source: 'real',
      cards: 40,
      rows: 480,
      rows_read: 0.97,
      wrong_auto_accepts: 0,
      date: '2026-11-20',
    },
  },
  trust: 'assisted',
  blank_image: 'example-12.blank.png',
  credit: { club: 'Example Trials Club', state: 'Example State' },
};

/** A copy of a profile with one change (a value of undefined removes the field). */
function changed(base: object, change: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...structuredClone(base), ...change };
  return Object.fromEntries(Object.entries(copy).filter(([, v]) => v !== undefined));
}

describe('card profiles', () => {
  it('ships every file in presets/card-profiles/, each valid', () => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.map((f) => f.replace(/\.json$/, '')).sort()).toEqual(
      CARD_PROFILES.map((p) => p.id).sort(),
    );
    for (const f of files) {
      const data: unknown = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      expect(checkCardProfile(data)).toEqual(data);
    }
  });

  it('describes the regional card exactly as the reader always read it', () => {
    expect(DEFAULT_CARD_PROFILE).toBe('regional-16');
    expect(cardProfile(undefined)).toBe(regional);
    expect(regional).toMatchObject({
      rows: 16,
      grid: { unit: 'column-width', row_pitch: 0.675, cell_radius: 0.15 },
      columns: [
        { score: 0, across: -1.53 },
        { score: 1, across: -1.01 },
        { score: 2, across: 0.99 },
        { score: 3, across: 1.52 },
        { score: 5, across: 2.02 },
      ],
      locator: 'black-column',
      marking_style: 'punch',
      correction_rules: 'inverse-all-but-one',
      thresholds: { mark: 0.55, confidence_gap: 0.2, colour_channel: 'luma' },
      trust: 'trusted',
    });
    expect(CARD_PROFILE_ROWS).toEqual({ 'regional-16': 16 });
  });

  it('accepts a profile using every field, in any column order', () => {
    expect(checkCardProfile(EVERY_FIELD)).toEqual(EVERY_FIELD);
  });

  it('accepts every allowed value of each choice', () => {
    for (const locator of ['black-column', 'card-edges', 'corner-markers', 'manual-corners']) {
      expect(() => checkCardProfile(changed(EVERY_FIELD, { locator }))).not.toThrow();
    }
    for (const marking_style of ['punch', 'pen-hole', 'ink']) {
      expect(() => checkCardProfile(changed(EVERY_FIELD, { marking_style }))).not.toThrow();
    }
    for (const correction_rules of ['inverse-all-but-one', 'none', 'crossed-out']) {
      expect(() => checkCardProfile(changed(EVERY_FIELD, { correction_rules }))).not.toThrow();
    }
    for (const trust of ['trusted', 'assisted']) {
      expect(() => checkCardProfile(changed(EVERY_FIELD, { trust }))).not.toThrow();
    }
    for (const colour_channel of ['luma', 'red', 'green', 'blue']) {
      const thresholds = { ...EVERY_FIELD.thresholds, colour_channel };
      expect(() => checkCardProfile(changed(EVERY_FIELD, { thresholds }))).not.toThrow();
    }
    for (const source of ['synthetic', 'real']) {
      const thresholds = {
        ...EVERY_FIELD.thresholds,
        tuned_from: { ...EVERY_FIELD.thresholds.tuned_from, source },
      };
      expect(() => checkCardProfile(changed(EVERY_FIELD, { thresholds }))).not.toThrow();
    }
  });

  it('leaves the blank card image and the credit optional', () => {
    expect(() =>
      checkCardProfile(changed(EVERY_FIELD, { blank_image: undefined, credit: undefined })),
    ).not.toThrow();
    expect(() =>
      checkCardProfile(changed(EVERY_FIELD, { credit: { club: 'A club' } })),
    ).not.toThrow();
  });

  it.each([
    'schema',
    'id',
    'name',
    'card',
    'rows',
    'grid',
    'columns',
    'locator',
    'marking_style',
    'correction_rules',
    'thresholds',
    'trust',
  ])('needs %s', (field) => {
    expect(() => checkCardProfile(changed(EVERY_FIELD, { [field]: undefined }))).toThrow(
      /not valid/,
    );
  });

  it.each([
    ['another schema', { schema: 'tscore.card_profile/2' }],
    ['an id with capitals', { id: 'Regional-16' }],
    ['an empty name', { name: '' }],
    ['a card with no width', { card: { height_mm: 150 } }],
    ['a card of no size', { card: { width_mm: 0, height_mm: 150 } }],
    ['no rows', { rows: 0 }],
    ['part of a row', { rows: 12.5 }],
    ['an unknown grid unit', { grid: { unit: 'inch', row_pitch: 0.8, cell_radius: 0.2 } }],
    ['no row pitch', { grid: { unit: 'column-width', row_pitch: 0, cell_radius: 0.2 } }],
    [
      'only two columns',
      {
        columns: [
          { score: 0, across: 1 },
          { score: 1, across: 2 },
        ],
      },
    ],
    ['a column without its score', { columns: [{ across: 1 }, { score: 1, across: 2 }] }],
    [
      'a negative score',
      {
        columns: [
          { score: -1, across: 1 },
          { score: 1, across: 2 },
          { score: 2, across: 3 },
        ],
      },
    ],
    ['an unknown locator', { locator: 'qr-code' }],
    ['an unknown marking style', { marking_style: 'stamp' }],
    ['an unknown correction rule', { correction_rules: 'initialled' }],
    ['an unknown trust level', { trust: 'certain' }],
    ['a blank image that is not a picture', { blank_image: 'blank.pdf' }],
    ['a blank image outside the folder', { blank_image: '../blank.png' }],
    ['an empty credit', { credit: {} }],
    ['credit with a person', { credit: { observer: 'Sam' } }],
    ['an unknown field', { licence: '12345' }],
  ])('rejects %s', (_, change) => {
    expect(() => checkCardProfile(changed(EVERY_FIELD, change))).toThrow(/not valid/);
  });

  it.each([
    ['a mark threshold of 1', { mark: 1 }],
    ['a confidence gap over 1', { confidence_gap: 1.2 }],
    ['an unknown colour channel', { colour_channel: 'infrared' }],
    ['no tuning record', { tuned_from: undefined }],
    [
      'a share of rows read over 1',
      { tuned_from: { ...EVERY_FIELD.thresholds.tuned_from, rows_read: 1.5 } },
    ],
    [
      'a tuning date that is not a date',
      { tuned_from: { ...EVERY_FIELD.thresholds.tuned_from, date: 'last week' } },
    ],
  ])('rejects thresholds with %s', (_, change) => {
    const thresholds = changed(EVERY_FIELD.thresholds, change);
    expect(() => checkCardProfile(changed(EVERY_FIELD, { thresholds }))).toThrow(/not valid/);
  });

  it('rejects two columns for one score, or two in one place', () => {
    const columns = [
      { score: 0, across: 1 },
      { score: 0, across: 2 },
      { score: 1, across: 3 },
    ];
    expect(() => checkCardProfile(changed(EVERY_FIELD, { columns }))).toThrow(/same score/);
    const sameplace = [
      { score: 0, across: 1 },
      { score: 1, across: 1 },
      { score: 2, across: 3 },
    ];
    expect(() => checkCardProfile(changed(EVERY_FIELD, { columns: sameplace }))).toThrow(
      /same place/,
    );
  });

  it('never trusts thresholds that read a wrong score', () => {
    const thresholds = {
      ...EVERY_FIELD.thresholds,
      tuned_from: { ...EVERY_FIELD.thresholds.tuned_from, wrong_auto_accepts: 1 },
    };
    expect(() => checkCardProfile(changed(EVERY_FIELD, { thresholds }))).not.toThrow();
    expect(() => checkCardProfile(changed(EVERY_FIELD, { thresholds, trust: 'trusted' }))).toThrow(
      /only be assisted/,
    );
  });

  it('auto-accepts only for a trusted profile', () => {
    expect(canAutoAccept(regional)).toBe(true);
    expect(canAutoAccept(EVERY_FIELD)).toBe(false);
  });

  it('finds no profile for an unknown id', () => {
    expect(cardProfile('nsw-20')).toBeUndefined();
  });
});
