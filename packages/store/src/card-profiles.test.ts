import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CARD_PROFILES, type CardProfile } from '@tscore/core';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  CardProfileShelf,
  packCardShare,
  unpackCardShare,
  type BlankImage,
} from './card-profiles.js';

/** An invented club card. */
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
  locator: 'black-column',
  marking_style: 'punch',
  correction_rules: 'inverse-all-but-one',
  thresholds: {
    mark: 0.5,
    confidence_gap: 0.2,
    colour_channel: 'luma',
    tuned_from: { source: 'synthetic', cards: 10, rows: 100, rows_read: 1, wrong_auto_accepts: 0 },
  },
  trust: 'assisted',
};

/** Not a real picture: just the bytes a PNG starts with, then some filler. */
const PNG: BlankImage = {
  type: 'png',
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
};

const laptop = () => {
  const settings = mkdtempSync(join(tmpdir(), 'tscore-cards-'));
  return { settings, shelf: new CardProfileShelf(settings) };
};

const zip = (files: Record<string, Uint8Array | string>) =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v]),
    ),
  );

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as { code?: string }).code;
  }
  return 'no error';
};

describe('card profiles on this laptop', () => {
  it('lists only the built-in profiles until one is imported', () => {
    const { shelf } = laptop();
    expect(shelf.list()).toEqual(CARD_PROFILES.map((profile) => ({ profile, builtIn: true })));
  });

  it('round-trips: shared on one laptop, imported on another, the same profile', () => {
    const one = laptop();
    one.shelf.save(CLUB_CARD, PNG);
    const file = join(one.settings, 'shared.tscore-card');
    one.shelf.exportFile(CLUB_CARD.id, file, { club: 'Example MCC', state: 'Example State' });

    const two = laptop();
    const { profile, replaced } = two.shelf.importFile(file);
    expect(replaced).toBe(false);
    const { blank_image: a, ...kept } = profile;
    expect(kept).toEqual({ ...CLUB_CARD, credit: { club: 'Example MCC', state: 'Example State' } });
    expect(a).toBe('example-club-10.blank.png');
    expect(two.shelf.blankImage(CLUB_CARD.id)?.bytes).toEqual(PNG.bytes);
    expect(two.shelf.list().map((k) => [k.profile.id, k.builtIn])).toEqual([
      ['regional-16', true],
      ['example-club-10', false],
    ]);
    expect(two.shelf.get(CLUB_CARD.id)?.profile).toEqual(profile);
  });

  it('holds exactly the profile and its picture, nothing else', () => {
    const entries = unzipSync(packCardShare(CLUB_CARD, PNG));
    expect(Object.keys(entries).sort()).toEqual(['blank.png', 'profile.json']);
    expect(Object.keys(unzipSync(packCardShare(CLUB_CARD, null)))).toEqual(['profile.json']);
    // The same profile always makes the same file.
    expect(packCardShare(CLUB_CARD, PNG)).toEqual(packCardShare(CLUB_CARD, PNG));
  });

  it('makes an imported profile assisted, whatever the file says', () => {
    const { settings, shelf } = laptop();
    const file = join(settings, 'trusted.tscore-card');
    writeFileSync(
      file,
      zip({ 'profile.json': JSON.stringify({ ...CLUB_CARD, trust: 'trusted' }) }),
    );
    expect(shelf.importFile(file).profile.trust).toBe('assisted');
    // Even if the kept file is edited by hand afterwards.
    const kept = join(settings, 'card-profiles', `${CLUB_CARD.id}.json`);
    writeFileSync(kept, JSON.stringify({ ...CLUB_CARD, trust: 'trusted' }));
    expect(shelf.get(CLUB_CARD.id)?.profile.trust).toBe('assisted');
  });

  it('replaces an earlier import of the same card, picture and all', () => {
    const { settings, shelf } = laptop();
    shelf.save(CLUB_CARD, PNG);
    const jpg: BlankImage = { type: 'jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9]) };
    const again = shelf.save({ ...CLUB_CARD, name: 'Example club card, new print' }, jpg);
    expect(again.replaced).toBe(true);
    expect(shelf.get(CLUB_CARD.id)?.profile.name).toBe('Example club card, new print');
    expect(readdirSync(join(settings, 'card-profiles')).sort()).toEqual([
      'example-club-10.blank.jpg',
      'example-club-10.json',
    ]);
    shelf.save(CLUB_CARD, null);
    expect(shelf.blankImage(CLUB_CARD.id)).toBeNull();
    expect(shelf.get(CLUB_CARD.id)?.profile).not.toHaveProperty('blank_image');
  });

  it('refuses fake or broken files, changing nothing', () => {
    const { settings, shelf } = laptop();
    const bad: [string, Uint8Array | string][] = [
      ['not a zip', 'hello'],
      ['empty zip', zip({})],
      ['not JSON', zip({ 'profile.json': '{nope' })],
      ['not a profile', zip({ 'profile.json': '{"name":"x"}' })],
      ['extra file', zip({ 'profile.json': JSON.stringify(CLUB_CARD), 'riders.csv': 'a,b' })],
      [
        'picture not named',
        zip({ 'profile.json': JSON.stringify(CLUB_CARD), 'blank.png': PNG.bytes }),
      ],
      [
        'picture missing',
        zip({ 'profile.json': JSON.stringify({ ...CLUB_CARD, blank_image: 'blank.png' }) }),
      ],
      [
        'not a picture',
        zip({
          'profile.json': JSON.stringify({ ...CLUB_CARD, blank_image: 'blank.png' }),
          'blank.png': 'GIF89a',
        }),
      ],
      [
        'escaping name',
        zip({
          'profile.json': JSON.stringify({ ...CLUB_CARD, blank_image: '../blank.png' }),
          '../blank.png': PNG.bytes,
        }),
      ],
    ];
    for (const [what, bytes] of bad) {
      const file = join(settings, `${what}.tscore-card`);
      writeFileSync(file, bytes);
      expect(
        code(() => shelf.importFile(file)),
        what,
      ).toBe('CARD_SHARE_BAD_FILE');
    }
    expect(code(() => shelf.importFile(join(settings, 'missing.tscore-card')))).toBe(
      'CARD_SHARE_BAD_FILE',
    );
    expect(existsSync(join(settings, 'card-profiles'))).toBe(false);
  });

  it('refuses a file for a built-in card type', () => {
    const { settings, shelf } = laptop();
    const file = join(settings, 'regional.tscore-card');
    writeFileSync(file, packCardShare(CARD_PROFILES[0] as CardProfile, null));
    expect(code(() => shelf.importFile(file))).toBe('CARD_SHARE_BUILT_IN');
  });

  it('leaves out a kept profile that no longer checks out, rather than stopping', () => {
    const { settings, shelf } = laptop();
    shelf.save(CLUB_CARD, null);
    writeFileSync(join(settings, 'card-profiles', 'broken.json'), '{ not json');
    writeFileSync(
      join(settings, 'card-profiles', 'wrong-name.json'),
      readFileSync(join(settings, 'card-profiles', `${CLUB_CARD.id}.json`)),
    );
    expect(
      shelf
        .list()
        .filter((k) => !k.builtIn)
        .map((k) => k.profile.id),
    ).toEqual([CLUB_CARD.id]);
  });
});
