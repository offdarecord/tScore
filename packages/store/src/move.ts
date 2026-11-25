/**
 * Moving an event to another laptop: the whole event in one file (a zip, `.tscore`), with a
 * manifest listing every file's size and SHA-256, so the other laptop can check the copy is
 * complete before using it.
 *
 * In the file: the event (a consistent snapshot of `event.sqlite`) and everything else in the
 * event folder that belongs to the event (card photos, logos), but not `backups/` or `exports/`:
 * backups stay with the laptop that made them, and exports can be made again.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, relative, sep } from 'node:path';
import { unzipSync, zipSync, type Zippable } from 'fflate';
import { StoreError } from './errors.js';
import { EVENT_FILE, type EventStore } from './event-store.js';

export const MOVE_EXTENSION = 'tscore';

/** A `.tscore` file that isn't one, or isn't complete. Nothing has been changed. */
class MoveFileError extends StoreError {
  constructor(detail: string) {
    super(
      'STORE_MOVE_FILE',
      `That file can't be opened: ${detail}. Nothing was changed. Save a new copy on the other laptop and try again.`,
    );
  }
}
export const MOVE_FORMAT = 'tscore.event_package/1';
const MANIFEST = 'manifest.json';
const LEFT_OUT = new Set(['backups', 'exports']);

export interface MoveManifest {
  readonly format: typeof MOVE_FORMAT;
  readonly app_version: string;
  readonly saved_at: string;
  readonly event: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    /** Day 1's date, YYYY-MM-DD. */
    readonly date?: string;
  };
  readonly files: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
}

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

/** The event as one `.tscore` file's bytes. */
export function packEvent(store: EventStore, appVersion: string, now: Date): Uint8Array {
  const tmp = mkdtempSync(join(tmpdir(), 'tscore-move-'));
  try {
    const snapshot = join(tmp, EVENT_FILE);
    store.copyTo(snapshot);
    const files: [string, Uint8Array][] = [[EVENT_FILE, readFileSync(snapshot)]];
    for (const file of walk(store.folder)) {
      const path = relative(store.folder, file).split(sep).join(posix.sep);
      const top = path.split('/')[0] ?? '';
      if (LEFT_OUT.has(top) || path === EVENT_FILE || path.startsWith(`${EVENT_FILE}-`)) continue;
      files.push([path, readFileSync(file)]);
    }
    const { event } = store.setup;
    const manifest: MoveManifest = {
      format: MOVE_FORMAT,
      app_version: appVersion,
      saved_at: now.toISOString(),
      event: {
        id: store.eventId,
        code: event.code,
        name: event.name,
        ...(store.setup.days[0]?.date !== undefined && { date: store.setup.days[0].date }),
      },
      files: files.map(([path, data]) => ({ path, bytes: data.length, sha256: sha256(data) })),
    };
    const zip: Zippable = {
      [MANIFEST]: [new TextEncoder().encode(JSON.stringify(manifest, null, 2)), { level: 6 }],
    };
    // Photos are already compressed; the event file shrinks a lot.
    for (const [path, data] of files) {
      zip[path] = [data, { level: /\.(jpe?g|png|webp)$/i.test(path) ? 0 : 6 }];
    }
    return zipSync(zip);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Read a `.tscore` file and check it's complete: a manifest, every file it lists with the
 * right size and SHA-256, nothing extra, and no path that could escape the event folder.
 */
export function unpackEvent(bytes: Uint8Array): {
  manifest: MoveManifest;
  files: Map<string, Uint8Array>;
} {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new MoveFileError("this isn't a tScore event file, or it's damaged");
  }
  const raw = entries[MANIFEST];
  let manifest: MoveManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(raw)) as MoveManifest;
  } catch {
    throw new MoveFileError("this isn't a tScore event file (no list of contents)");
  }
  if (manifest.format !== MOVE_FORMAT || !Array.isArray(manifest.files)) {
    throw new MoveFileError("this isn't a tScore event file this version can read");
  }
  const files = new Map<string, Uint8Array>();
  for (const f of manifest.files) {
    if (!safePath(f.path)) throw new MoveFileError(`it lists a file with a bad name (${f.path})`);
    const data = entries[f.path];
    if (!data) throw new MoveFileError(`it's incomplete: ${f.path} is missing`);
    if (data.length !== f.bytes || sha256(data) !== f.sha256) {
      throw new MoveFileError(`it's damaged: ${f.path} doesn't match its checksum`);
    }
    files.set(f.path, data);
  }
  if (!files.has(EVENT_FILE)) throw new MoveFileError("it's incomplete: the event is missing");
  const extra = Object.keys(entries).filter(
    (p) => p !== MANIFEST && !files.has(p) && !p.endsWith('/'),
  );
  if (extra.length) throw new MoveFileError(`it has files it doesn't list (${extra[0]})`);
  return { manifest, files };
}

/** A relative path with no `..`, drive or leading slash. */
function safePath(path: unknown): path is string {
  if (typeof path !== 'string' || !path || path.length > 260) return false;
  if (path.startsWith('/') || path.includes('\\') || /^[a-zA-Z]:/.test(path)) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}
