import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardProfile, type CardProfile } from './card-profiles.js';
import {
  blankImageType,
  CardShareError,
  cardShareFileName,
  cardShareMailto,
  importedCardProfile,
  sharedCardProfile,
} from './card-share.js';
import { checkContact, CONTACT } from './contact.js';
import { SUGGESTION_EMAIL } from './suggestion.js';

/** An invented club card, as a club might teach it. */
const CLUB_CARD: CardProfile = {
  schema: 'tscore.card_profile/1',
  id: 'example-club-10',
  name: 'Example club card, 10 sections',
  card: { width_mm: 55, height_mm: 140 },
  rows: 10,
  grid: { unit: 'column-width', row_pitch: 0.7, cell_radius: 0.15 },
  columns: [
    { score: 0, across: -1.5 },
    { score: 1, across: -1 },
    { score: 2, across: 1 },
    { score: 3, across: 1.5 },
    { score: 5, across: 2 },
  ],
  locator: 'manual-corners',
  marking_style: 'punch',
  correction_rules: 'none',
  thresholds: {
    mark: 0.5,
    confidence_gap: 0.2,
    colour_channel: 'luma',
    tuned_from: { source: 'real', cards: 12, rows: 120, rows_read: 0.9, wrong_auto_accepts: 1 },
  },
  trust: 'assisted',
  credit: { club: 'Example Trials Club' },
};

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as CardShareError).code;
  }
  return 'no error';
};

describe('importing a shared card profile', () => {
  it('keeps the profile as it is, but always assisted', () => {
    expect(importedCardProfile(CLUB_CARD)).toEqual(CLUB_CARD);
    // A file can't make itself trusted, even one whose thresholds never misread.
    const claimsTrust = { ...CLUB_CARD, trust: 'trusted' };
    expect(importedCardProfile(claimsTrust).trust).toBe('assisted');
    const clean = {
      ...claimsTrust,
      thresholds: {
        ...CLUB_CARD.thresholds,
        tuned_from: { ...CLUB_CARD.thresholds.tuned_from, wrong_auto_accepts: 0 },
      },
    };
    expect(importedCardProfile(clean).trust).toBe('assisted');
  });

  it("drops the file's picture name: whoever keeps the profile names its picture", () => {
    expect(importedCardProfile({ ...CLUB_CARD, blank_image: 'blank.png' })).toEqual(CLUB_CARD);
  });

  it('refuses something that is not a card profile, with a catalogue code', () => {
    for (const bad of [
      null,
      'text',
      [],
      {},
      { ...CLUB_CARD, rows: 0 },
      { ...CLUB_CARD, rider: 'x' },
    ]) {
      expect(code(() => importedCardProfile(bad))).toBe('CARD_SHARE_BAD_FILE');
    }
    expect(code(() => importedCardProfile({ ...CLUB_CARD, schema: 'tscore.card_profile/2' }))).toBe(
      'CARD_SHARE_BAD_FILE',
    );
  });

  it('refuses a built-in id, so a file can never stand in for a shipped profile', () => {
    const regional = cardProfile('regional-16') as CardProfile;
    expect(code(() => importedCardProfile(regional))).toBe('CARD_SHARE_BUILT_IN');
    expect(code(() => importedCardProfile({ ...CLUB_CARD, id: 'regional-16' }))).toBe(
      'CARD_SHARE_BUILT_IN',
    );
  });
});

describe('sharing a card profile', () => {
  it('names the picture in the file, and puts in the credit typed', () => {
    const shared = sharedCardProfile(CLUB_CARD, 'png', {
      club: ' Example MCC ',
      state: 'Tasmania',
    });
    expect(shared.blank_image).toBe('blank.png');
    expect(shared.credit).toEqual({ club: 'Example MCC', state: 'Tasmania' });
    expect(importedCardProfile(shared)).toEqual({ ...CLUB_CARD, credit: shared.credit });
  });

  it('keeps the old credit when none is typed, and drops an empty one', () => {
    expect(sharedCardProfile(CLUB_CARD, null).credit).toEqual(CLUB_CARD.credit);
    const none = sharedCardProfile(CLUB_CARD, null, { club: ' ', state: '' });
    expect(none).not.toHaveProperty('credit');
    expect(none).not.toHaveProperty('blank_image');
  });

  it('names the file after the profile', () => {
    expect(cardShareFileName(CLUB_CARD)).toBe('example-club-10.tscore-card');
  });

  it('opens an email to the maintainers that says what to attach', () => {
    const link = cardShareMailto(CLUB_CARD, 'example-club-10.tscore-card', '0.8.0');
    expect(link.startsWith(`mailto:${CONTACT.email}?subject=`)).toBe(true);
    const body = decodeURIComponent(link.split('&body=')[1] ?? '');
    expect(body).toContain('example-club-10.tscore-card is attached');
    expect(body).toContain('Example Trials Club');
    expect(body).toContain('tScore version: 0.8.0');
    expect(link.length).toBeLessThan(1800);
  });

  it('tells pictures apart by their bytes, not their names', () => {
    expect(
      blankImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toBe('png');
    expect(blankImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(blankImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull();
  });
});

describe('the contact preset', () => {
  it('is checked, and both suggestions and card profiles use it', () => {
    const file: unknown = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../../presets/contact.json'), 'utf8'),
    );
    expect(checkContact(file)).toEqual(file);
    expect(SUGGESTION_EMAIL).toBe(CONTACT.email);
    expect(() => checkContact({ ...CONTACT, email: 'x@y.com?cc=z@w.com' })).toThrow();
    expect(() => checkContact({ ...CONTACT, new_card_type_form: 'https://example.com' })).toThrow();
  });
});
