/**
 * Sharing card profiles (issue #108): a club's own card type travels as a `.tscore-card` file,
 * a zip holding `profile.json` (a `tscore.card_profile/1` profile, exactly as in
 * presets/card-profiles/) and, if there is one, the blank card's picture. Nothing else, so the
 * file can never carry rider data.
 *
 * The zip itself is read and written by @tscore/store; this file holds the rules, so they're the
 * same wherever a profile arrives from (a file today, the Teach a card wizard next, #107).
 */
import { CARD_PROFILES, checkCardProfile, type CardProfile } from './card-profiles.js';
import { CONTACT } from './contact.js';

export const CARD_SHARE_EXTENSION = 'tscore-card';
/** The profile's name inside the zip. */
export const CARD_SHARE_PROFILE = 'profile.json';
/** A shared file bigger than this isn't a card profile (a blank card's photo is well under). */
export const CARD_SHARE_MAX_BYTES = 12 * 1024 * 1024;
/** The blank card's picture, at most. */
export const BLANK_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export type BlankImageType = 'png' | 'jpg';

/** The blank card's picture in a shared file is always called this, plus its type. */
export const blankImageName = (type: BlankImageType) => `blank.${type}`;

/** A message's key in the app's message files, and the values it fills in. */
export interface CardShareWords {
  readonly key: string;
  readonly values?: Readonly<Record<string, string>>;
}

/** A file that can't be imported, with a code from the error catalogue. */
export class CardShareError extends Error {
  readonly code: string;
  readonly words: CardShareWords;
  constructor(
    code: 'CARD_SHARE_BAD_FILE' | 'CARD_SHARE_BUILT_IN',
    message: string,
    words: CardShareWords,
  ) {
    super(message);
    this.name = 'CardShareError';
    this.code = code;
    this.words = words;
  }
}

/** Refuse a file that isn't a card profile, saying why in a few plain words. */
export function badCardFile(detail: string): CardShareError {
  return new CardShareError(
    'CARD_SHARE_BAD_FILE',
    `That isn't a card profile tScore can use: ${detail}. Nothing was changed.`,
    { key: 'errors.CARD_SHARE_BAD_FILE', values: { detail } },
  );
}

/** PNG or JPEG, by the bytes it starts with (never by its name). */
export function blankImageType(bytes: Uint8Array): BlankImageType | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > 8 && png.every((b, i) => bytes[i] === b)) return 'png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return null;
}

/**
 * A profile from outside tScore, ready to keep on this laptop. Checked against the schema and
 * the profile rules, and **always `assisted`**, whatever it says: only profiles shipped with
 * tScore can be trusted to save cards by themselves. A built-in profile's id is refused, so an
 * imported file can never stand in for one. Its `blank_image` is dropped: whoever keeps the
 * profile names the picture they keep with it.
 */
export function importedCardProfile(
  data: unknown,
  builtIn: readonly CardProfile[] = CARD_PROFILES,
): CardProfile {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw badCardFile('it has no card profile in it');
  }
  const { blank_image: _ignored, ...rest } = data as Record<string, unknown>;
  let profile: CardProfile;
  try {
    profile = checkCardProfile({ ...rest, trust: 'assisted' });
  } catch (err) {
    const detail = (err as Error).message.replace(/^Card profile (is not valid: )?/, '');
    throw badCardFile(`its card profile isn't complete or isn't right (${detail})`);
  }
  const clash = builtIn.find((p) => p.id === profile.id);
  if (clash) {
    throw new CardShareError(
      'CARD_SHARE_BUILT_IN',
      `"${clash.name}" is already built into tScore, so it can't be replaced by a file. Nothing was changed.`,
      { key: 'errors.CARD_SHARE_BUILT_IN', values: { name: clash.name } },
    );
  }
  return profile;
}

/** Who described the card, typed in when sharing it. Empty parts are left out. */
export interface CardCredit {
  readonly club?: string;
  readonly state?: string;
}

/**
 * The profile as it goes into a shared file: the credit typed in (if any) replaces the old one,
 * and `blank_image` names the picture in the file (or is left out when there's none).
 */
export function sharedCardProfile(
  profile: CardProfile,
  image: BlankImageType | null,
  credit?: CardCredit,
): CardProfile {
  const { blank_image: _old, credit: oldCredit, ...rest } = profile;
  const club = credit?.club?.trim().slice(0, 120);
  const state = credit?.state?.trim().slice(0, 60);
  const typed = credit ? { ...(club && { club }), ...(state && { state }) } : undefined;
  const kept = typed ?? oldCredit;
  return {
    ...rest,
    ...(image && { blank_image: blankImageName(image) }),
    ...(kept && Object.keys(kept).length > 0 && { credit: kept }),
  };
}

/** A safe file name for the shared file: the profile id, which the schema keeps plain. */
export const cardShareFileName = (profile: Pick<CardProfile, 'id'>) =>
  `${profile.id}.${CARD_SHARE_EXTENSION}`;

/**
 * The `mailto:` link that opens the person's own mail app, addressed to the maintainers, with
 * a note saying what's attached. A link can't attach a file, so the app reminds them to.
 */
export function cardShareMailto(
  profile: Pick<CardProfile, 'id' | 'name' | 'rows' | 'credit'>,
  fileName: string,
  appVersion: string,
  contact = CONTACT,
): string {
  const from = [profile.credit?.club, profile.credit?.state].filter(Boolean).join(', ');
  const body = [
    'Hello tScore maintainers,',
    '',
    `Here is a card profile to build into tScore: ${profile.name} (${profile.rows} sections).`,
    ...(from ? [`It's from ${from}.`] : []),
    '',
    `The file ${fileName} is attached. It holds the profile and a picture of a blank card, no rider details.`,
    '',
    '---',
    `Profile id: ${profile.id}`,
    `tScore version: ${appVersion}`,
    '',
  ].join('\n');
  const subject = `tScore card profile: ${profile.name}`;
  return `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
