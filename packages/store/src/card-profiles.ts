/**
 * Card profiles on this laptop (issue #108): the built-in ones shipped with tScore, plus any a
 * club imported from a `.tscore-card` file or (next, #107) taught on this laptop. Imported
 * profiles live in the app settings folder, `card-profiles/<id>.json`, each with its blank
 * card's picture beside it. They're always `assisted`: a person confirms every card.
 *
 * Kept free of Electron so it can be tested with plain Node; the app passes in its folder.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  BLANK_IMAGE_MAX_BYTES,
  CARD_PROFILES,
  CARD_SHARE_MAX_BYTES,
  CARD_SHARE_PROFILE,
  badCardFile,
  blankImageName,
  blankImageType,
  importedCardProfile,
  sharedCardProfile,
  type BlankImageType,
  type CardCredit,
  type CardProfile,
} from '@tscore/core';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

const FOLDER = 'card-profiles';

/** A profile, and whether it came with tScore or was added on this laptop. */
export interface KnownCardProfile {
  readonly profile: CardProfile;
  readonly builtIn: boolean;
}

/** A blank card's picture. */
export interface BlankImage {
  readonly type: BlankImageType;
  readonly bytes: Uint8Array;
}

/** What a `.tscore-card` file holds, once checked. */
export interface SharedCard {
  readonly profile: CardProfile;
  readonly image: BlankImage | null;
}

/** Read and check a `.tscore-card` file's bytes. Refuses anything that isn't exactly one. */
export function unpackCardShare(bytes: Uint8Array): SharedCard {
  if (bytes.length > CARD_SHARE_MAX_BYTES) throw badCardFile('it is far too big');
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      // Never unpack something too big to be a blank card's picture.
      filter: (f) => {
        if (f.originalSize > BLANK_IMAGE_MAX_BYTES) throw new Error('too big');
        return true;
      },
    });
  } catch {
    throw badCardFile("it isn't a .tscore-card file, or it's damaged");
  }
  const names = Object.keys(entries).filter((n) => !n.endsWith('/'));
  const raw = entries[CARD_SHARE_PROFILE];
  if (!raw) throw badCardFile('it has no card profile in it');
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    throw badCardFile("its card profile can't be read");
  }
  const named = (data as { blank_image?: unknown } | null)?.blank_image;
  const imageName = names.find((n) => n !== CARD_SHARE_PROFILE);
  const extra = names.filter((n) => n !== CARD_SHARE_PROFILE && n !== imageName);
  if (extra.length || (imageName !== undefined && imageName !== named)) {
    throw badCardFile('it holds something other than a card profile and its picture');
  }
  if (named !== undefined && imageName === undefined) {
    throw badCardFile("it's incomplete: the blank card's picture is missing");
  }
  const profile = importedCardProfile(data);
  let image: BlankImage | null = null;
  if (imageName !== undefined) {
    const imageBytes = entries[imageName] as Uint8Array;
    const type = blankImageType(imageBytes);
    if (!type || imageName !== blankImageName(type)) {
      throw badCardFile("the blank card's picture isn't a PNG or JPEG picture");
    }
    image = { type, bytes: imageBytes };
  }
  return { profile, image };
}

/** The bytes of a `.tscore-card` file: the profile (with the credit given) and its picture. */
export function packCardShare(
  profile: CardProfile,
  image: BlankImage | null,
  credit?: CardCredit,
): Uint8Array {
  const shared = sharedCardProfile(profile, image?.type ?? null, credit);
  const zip: Zippable = {
    [CARD_SHARE_PROFILE]: strToU8(JSON.stringify(shared, null, 2) + '\n'),
  };
  if (image) zip[blankImageName(image.type)] = [image.bytes, { level: 0 }];
  // A fixed date, so the same profile always makes the same file.
  return zipSync(zip, { mtime: new Date('2026-01-01T00:00:00Z') });
}

/** The card profiles a laptop knows: built in, then imported, by name. */
export class CardProfileShelf {
  readonly #dir: string;
  readonly #builtIn: readonly CardProfile[];

  constructor(settingsDir: string, builtIn: readonly CardProfile[] = CARD_PROFILES) {
    this.#dir = join(settingsDir, FOLDER);
    this.#builtIn = builtIn;
  }

  /**
   * Every profile: built in first, then the imported ones by name. A kept file that no longer
   * checks out (edited by hand, or damaged) is left out rather than stopping the app.
   */
  list(): KnownCardProfile[] {
    const imported: CardProfile[] = [];
    let files: string[] = [];
    try {
      files = readdirSync(this.#dir).filter((f) => f.endsWith('.json'));
    } catch {
      // No folder yet: nothing imported.
    }
    for (const f of files) {
      try {
        const raw = JSON.parse(readFileSync(join(this.#dir, f), 'utf8')) as {
          blank_image?: unknown;
        };
        const p = importedCardProfile(raw, this.#builtIn);
        const image = typeof raw.blank_image === 'string' ? raw.blank_image : undefined;
        if (`${p.id}.json` === f) imported.push(this.#withImage(p, image));
      } catch {
        // Skipped: see above.
      }
    }
    imported.sort((a, b) => a.name.localeCompare(b.name));
    return [
      ...this.#builtIn.map((profile) => ({ profile, builtIn: true })),
      ...imported.map((profile) => ({ profile, builtIn: false })),
    ];
  }

  /** Every profile, for code that only needs the profiles themselves. */
  profiles(): CardProfile[] {
    return this.list().map((k) => k.profile);
  }

  /** The profile with this id, if this laptop knows it. */
  get(id: string): KnownCardProfile | undefined {
    return this.list().find((k) => k.profile.id === id);
  }

  /** The blank card's picture kept with an imported profile, if any. */
  blankImage(id: string): BlankImage | null {
    const known = this.get(id);
    const name = known?.builtIn ? undefined : known?.profile.blank_image;
    if (!name) return null;
    try {
      const bytes = new Uint8Array(readFileSync(join(this.#dir, name)));
      const type = blankImageType(bytes);
      return type ? { type, bytes } : null;
    } catch {
      return null;
    }
  }

  /**
   * Keep a profile on this laptop: the one path every profile from outside tScore comes in by
   * (a `.tscore-card` file now; the Teach a card wizard next). It's checked, made `assisted`,
   * and replaces an earlier one with the same id. A built-in id is refused.
   */
  save(data: unknown, image: BlankImage | null): { profile: CardProfile; replaced: boolean } {
    const checked = importedCardProfile(data, this.#builtIn);
    if (
      image &&
      (image.bytes.length > BLANK_IMAGE_MAX_BYTES || blankImageType(image.bytes) !== image.type)
    ) {
      throw badCardFile("the blank card's picture isn't a PNG or JPEG picture");
    }
    mkdirSync(this.#dir, { recursive: true });
    const jsonFile = join(this.#dir, `${checked.id}.json`);
    const replaced = existsSync(jsonFile);
    const imageName = image ? `${checked.id}.${blankImageName(image.type)}` : undefined;
    const profile: CardProfile = { ...checked, ...(imageName && { blank_image: imageName }) };
    // Picture first, then the profile, each written whole, so a crash never leaves a profile
    // pointing at a half-written picture.
    for (const old of this.#imagesOf(checked.id)) {
      if (old !== imageName) rmSync(join(this.#dir, old), { force: true });
    }
    if (image && imageName) writeWhole(join(this.#dir, imageName), image.bytes);
    writeWhole(jsonFile, JSON.stringify(profile, null, 2) + '\n');
    return { profile, replaced };
  }

  /** Import a `.tscore-card` file from disk. */
  importFile(path: string): { profile: CardProfile; replaced: boolean } {
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      throw badCardFile("the file can't be opened");
    }
    if (size > CARD_SHARE_MAX_BYTES) throw badCardFile('it is far too big');
    const shared = unpackCardShare(new Uint8Array(readFileSync(path)));
    return this.save(shared.profile, shared.image);
  }

  /** Save a profile this laptop knows as a `.tscore-card` file, with the credit typed in. */
  exportFile(id: string, path: string, credit?: CardCredit): CardProfile {
    const known = this.get(id);
    if (!known) throw badCardFile('this laptop no longer has that card type');
    const image = this.blankImage(id);
    const bytes = packCardShare(known.profile, image, credit);
    writeWhole(path, bytes);
    return sharedCardProfile(known.profile, image?.type ?? null, credit);
  }

  /** Pictures kept for this id (any type). */
  #imagesOf(id: string): string[] {
    try {
      return readdirSync(this.#dir).filter(
        (f) => f === `${id}.blank.png` || f === `${id}.blank.jpg`,
      );
    } catch {
      return [];
    }
  }

  /** A profile's picture is named after it; drop the name if the picture has gone. */
  #withImage(p: CardProfile, name: string | undefined): CardProfile {
    const ok = name !== undefined && this.#imagesOf(p.id).includes(name);
    return ok ? { ...p, blank_image: name } : p;
  }
}

/** Write a file whole: to a temporary name, then renamed over the old one. */
function writeWhole(path: string, data: string | Uint8Array): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}
