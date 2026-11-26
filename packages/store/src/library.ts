/**
 * The events on this laptop, as the app sees them: where new events go, the recent-events list,
 * this station's id, and the one event that's open (one event at a time, ADR 0005).
 *
 * Kept free of Electron so it can be tested with plain Node; the app passes in its folders.
 */
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { validateEventSetup, type EventSetup } from '@tscore/core';
import { DamagedFileError, SetupError, StoreError } from './errors.js';
import { EVENT_FILE, EventStore, type StoreContext } from './event-store.js';
import { fullSizeCardPhotos, readManagedEvent, type ManagedEvent } from './manage.js';
import { packEvent, unpackEvent } from './move.js';

export interface LibraryOptions {
  /** App settings folder (Electron's userData): the station id and recent-events list live here. */
  readonly settingsDir: string;
  /** Where new events are made, one folder each (Documents\tScore by default). */
  readonly eventsDir: string;
  readonly appVersion: string;
  /** For tests. */
  readonly now?: () => Date;
  /** Called just before an open event closes (e.g. to back it up). */
  readonly beforeClose?: (store: EventStore) => void;
}

/** An event in the recent list, with enough to show it without opening its file. */
export interface RecentEvent {
  readonly folder: string;
  readonly name: string;
  readonly code: string;
  /** Day 1's date (YYYY-MM-DD), if set. */
  readonly date?: string;
  readonly days: number;
  readonly lastOpened: string;
  /** The folder or its event file is gone (moved, deleted, or a USB stick not plugged in). */
  readonly missing: boolean;
}

const RECENT_FILE = 'recent-events.json';
const TIDY_FILE = 'tidy-up.json';
const CLUB_LOGOS_FILE = 'club-logos.json';
const STATION_FILE = 'station.json';
const RECENT_MAX = 20;

type StoredRecent = Omit<RecentEvent, 'missing'>;

/** Manage events' settings on this laptop: events to keep as they are, and when to ask again. */
export interface TidyPrefs {
  /** Folders the desk chose to keep: never offered for tidying again. */
  readonly keep: readonly string[];
  /** Don't offer old events again before this (ISO), after "Remind me later". */
  readonly remindAfter?: string;
}

export class EventLibrary {
  readonly eventsDir: string;
  readonly #settingsDir: string;
  readonly #appVersion: string;
  readonly #now: () => Date;
  readonly #beforeClose: ((store: EventStore) => void) | undefined;
  #current: EventStore | null = null;
  #stationId: string | null = null;

  constructor(options: LibraryOptions) {
    this.eventsDir = options.eventsDir;
    this.#settingsDir = options.settingsDir;
    this.#appVersion = options.appVersion;
    this.#now = options.now ?? (() => new Date());
    this.#beforeClose = options.beforeClose;
  }

  /** The open event, if any. */
  get current(): EventStore | null {
    return this.#current;
  }

  /** This laptop's id, made once and kept in the settings folder. */
  stationId(): string {
    if (this.#stationId) return this.#stationId;
    const file = join(this.#settingsDir, STATION_FILE);
    const saved = readJson<{ stationId?: unknown }>(file);
    if (typeof saved?.stationId === 'string' && saved.stationId) {
      this.#stationId = saved.stationId;
    } else {
      this.#stationId = randomUUID();
      writeJson(file, { stationId: this.#stationId });
    }
    return this.#stationId;
  }

  context(): StoreContext {
    return { stationId: this.stationId(), appVersion: this.#appVersion, now: this.#now };
  }

  /** Recent events, most recently opened first. */
  recent(): RecentEvent[] {
    return this.#readRecent().map((r) => ({
      ...r,
      missing: !existsSync(join(r.folder, EVENT_FILE)),
    }));
  }

  /** Take an event off the recent list. Its folder is left alone. */
  forget(folder: string): void {
    const key = folderKey(folder);
    this.#writeRecent(this.#readRecent().filter((r) => folderKey(r.folder) !== key));
  }

  /** True if `folder` is on the recent list. */
  isRecent(folder: string): boolean {
    const key = folderKey(folder);
    return this.#readRecent().some((r) => folderKey(r.folder) === key);
  }

  /**
   * The folder a new event goes in: "<date> <code>" under the events folder, so Explorer sorts
   * events by date. A number is added if that folder is already used.
   */
  folderFor(setup: EventSetup): string {
    return this.#freeFolder(setup.days[0]?.date, setup.event.code);
  }

  #freeFolder(date: string | undefined, code: string): string {
    const base = join(this.eventsDir, `${date ?? this.#now().toISOString().slice(0, 10)} ${code}`);
    let folder = base;
    for (let n = 2; existsSync(folder); n++) folder = `${base} (${n})`;
    return folder;
  }

  /**
   * Save the open event as one file to carry to another laptop, then read the file back to
   * check it. Backups and exports are left out (see move.ts).
   */
  saveForMove(file: string): { bytes: number; files: number } {
    const store = this.#current;
    if (!store)
      throw new StoreError('STORE_NO_EVENT', 'No event is open.', {
        key: 'errors.STORE_NO_EVENT_2',
      });
    return this.#pack(store, file);
  }

  /**
   * Open an event saved on another laptop with saveForMove: checked, then unpacked into a new
   * folder beside the others ("<date> <code>", numbered if that's taken). Nothing existing is
   * touched, and the new folder is removed again if the event can't be opened.
   */
  openMoved(file: string): EventStore {
    const { manifest, files } = unpackEvent(readFileSync(file));
    mkdirSync(this.eventsDir, { recursive: true });
    const folder = this.#freeFolder(manifest.event.date, safeName(manifest.event.code));
    let store: EventStore;
    try {
      for (const [path, data] of files) {
        const target = join(folder, ...path.split('/'));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, data);
      }
      store = EventStore.open(folder, this.context());
    } catch (err) {
      rmSync(folder, { recursive: true, force: true });
      throw err;
    }
    store.noteMovedIn(basename(file));
    return this.#use(store);
  }

  // ---- Manage events ----

  /**
   * Every event folder in the events folder, plus recent events kept elsewhere that are still
   * there. Newest first by date.
   */
  manageList(): ManagedEvent[] {
    const seen = new Set<string>();
    const out: ManagedEvent[] = [];
    const add = (folder: string) => {
      const key = folderKey(folder);
      if (seen.has(key)) return;
      seen.add(key);
      const info = readManagedEvent(resolve(folder));
      if (info) out.push(info);
    };
    let names: string[] = [];
    try {
      names = readdirSync(this.eventsDir);
    } catch {
      // No events folder yet.
    }
    for (const n of names) {
      const folder = join(this.eventsDir, n);
      if (statSync(folder, { throwIfNoEntry: false })?.isDirectory()) add(folder);
    }
    for (const r of this.#readRecent()) add(r.folder);
    return out.sort((a, b) => (b.firstDate ?? '').localeCompare(a.firstDate ?? ''));
  }

  /** True if `folder` is the open event. */
  isOpen(folder: string): boolean {
    return this.#current !== null && folderKey(this.#current.folder) === folderKey(folder);
  }

  /**
   * Shrink an event's card photos to small copies (`shrink` makes one from a full-size photo),
   * keeping the event file, results and backups. Recorded in the event's audit log.
   */
  removeCardScans(
    folder: string,
    shrink: (photo: Uint8Array) => Uint8Array,
  ): { images: number; bytesFreed: number } {
    const info = this.#managed(folder);
    let images = 0;
    let bytesFreed = 0;
    for (const file of fullSizeCardPhotos(info.folder)) {
      const before = statSync(file).size;
      const small = shrink(readFileSync(file));
      if (small.length === 0 || small.length >= before) continue;
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, small);
      renameSync(tmp, file);
      images++;
      bytesFreed += before - small.length;
    }
    const store = EventStore.open(info.folder, this.context());
    try {
      store.noteScansRemoved(images, bytesFreed);
    } finally {
      store.close();
    }
    return { images, bytesFreed };
  }

  /**
   * Check an event may be deleted: it's a known event folder, not open, and `typedCode` is its
   * code. The app then moves the folder to the Recycle Bin and calls `forget`.
   */
  checkDelete(folder: string, typedCode: string): ManagedEvent {
    const info = this.#managed(folder);
    if (
      typeof typedCode !== 'string' ||
      typedCode.trim().toUpperCase() !== info.code.toUpperCase()
    ) {
      throw new StoreError(
        'STORE_CONFIRM_CODE',
        `Type the event's code, ${info.code}, to delete it.`,
        { key: 'errors.STORE_CONFIRM_CODE', values: { code: info.code } },
      );
    }
    return info;
  }

  /** Save a closed event as one file to carry elsewhere (as saveForMove), before deleting it. */
  saveCopyOf(folder: string, file: string): { bytes: number; files: number } {
    const info = this.#managed(folder);
    const store = EventStore.open(info.folder, this.context());
    try {
      return this.#pack(store, file);
    } finally {
      store.close();
    }
  }

  /** Manage events' settings on this laptop. */
  tidyPrefs(): TidyPrefs {
    const data = readJson<{ keep?: unknown; remindAfter?: unknown }>(
      join(this.#settingsDir, TIDY_FILE),
    );
    const keep = Array.isArray(data?.keep)
      ? data.keep.filter((k): k is string => typeof k === 'string')
      : [];
    return {
      keep,
      ...(typeof data?.remindAfter === 'string' && { remindAfter: data.remindAfter }),
    };
  }

  /** Never offer this event for tidying again. */
  keepEvent(folder: string): void {
    const prefs = this.tidyPrefs();
    const key = folderKey(folder);
    if (prefs.keep.some((k) => folderKey(k) === key)) return;
    writeJson(join(this.#settingsDir, TIDY_FILE), {
      ...prefs,
      keep: [...prefs.keep, resolve(folder)],
    });
  }

  /** Don't offer old events again for `days` days. */
  remindLater(days = 30): void {
    const at = new Date(this.#now().getTime() + days * 86_400_000).toISOString();
    writeJson(join(this.#settingsDir, TIDY_FILE), { ...this.tidyPrefs(), remindAfter: at });
  }

  /** A folder Manage events lists, and not the open event: anything else is refused. */
  #managed(folder: string): ManagedEvent {
    if (typeof folder !== 'string')
      throw new StoreError('APP_BAD_REQUEST', 'No event chosen.', {
        key: 'errors.APP_BAD_REQUEST',
      });
    const key = folderKey(folder);
    const info = this.manageList().find((e) => folderKey(e.folder) === key);
    if (!info) {
      throw new StoreError('STORE_NOT_MANAGED', "That folder isn't one of this laptop's events.", {
        key: 'errors.STORE_NOT_MANAGED',
      });
    }
    if (this.isOpen(info.folder)) {
      throw new StoreError('STORE_EVENT_OPEN', 'Close the event first, then tidy it up.', {
        key: 'errors.STORE_EVENT_OPEN',
      });
    }
    return info;
  }

  #pack(store: EventStore, file: string): { bytes: number; files: number } {
    store.noteMovedOut(basename(file));
    const data = packEvent(store, this.#appVersion, this.#now());
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, data);
    renameSync(tmp, file);
    const { manifest } = unpackEvent(readFileSync(file));
    return { bytes: data.length, files: manifest.files.length };
  }

  /** Make a new event and open it (closing any open event). */
  create(setup: unknown): EventStore {
    const r = validateEventSetup(setup);
    if (!r.ok) throw new SetupError(r.issues);
    mkdirSync(this.eventsDir, { recursive: true });
    const store = this.#use(EventStore.create(this.folderFor(r.value), r.value, this.context()));
    // The organising club's logo, as last chosen on this laptop (#111).
    const club = r.value.event.club;
    const logo = club ? this.clubLogo(club) : null;
    if (logo) {
      try {
        store.addLogo('club', logo);
      } catch {
        // A remembered logo that is no longer valid is simply not used.
      }
    }
    return store;
  }

  /** The logo last chosen for this club on this laptop, if any (#111). */
  clubLogo(club: string): Uint8Array | null {
    const data = readJson<{ clubs?: Record<string, { data?: unknown }> }>(
      join(this.#settingsDir, CLUB_LOGOS_FILE),
    );
    const saved = data?.clubs?.[clubKey(club)]?.data;
    return typeof saved === 'string' ? Buffer.from(saved, 'base64') : null;
  }

  /** Remember a club's logo for its next events on this laptop. */
  rememberClubLogo(club: string, logo: Uint8Array): void {
    const key = clubKey(club);
    if (!key) return;
    const file = join(this.#settingsDir, CLUB_LOGOS_FILE);
    const clubs = readJson<{ clubs?: Record<string, unknown> }>(file)?.clubs ?? {};
    writeJson(file, {
      clubs: { ...clubs, [key]: { name: club.trim(), data: Buffer.from(logo).toString('base64') } },
    });
  }

  /** Open an event folder (closing any open event). */
  open(folder: string): EventStore {
    if (this.#current && folderKey(this.#current.folder) === folderKey(folder)) {
      return this.#current;
    }
    return this.#use(EventStore.open(folder, this.context()));
  }

  /** Save a changed setup for the open event, and refresh its recent-list entry. */
  updateSetup(setup: unknown): EventStore {
    const store = this.#current;
    if (!store)
      throw new StoreError('STORE_NO_EVENT', 'No event is open.', {
        key: 'errors.STORE_NO_EVENT_2',
      });
    store.updateSetup(setup);
    this.#remember(store);
    return store;
  }

  close(): void {
    if (this.#current) {
      try {
        this.#beforeClose?.(this.#current);
      } finally {
        this.#current.close();
        this.#current = null;
      }
    }
  }

  /**
   * Open a backup as a new event folder, "<date> <code> restored <when>", beside the others.
   * Nothing existing is touched. The file is checked (integrity, version) as it's opened, and
   * the new folder is removed again if it can't be.
   */
  restore(backupFile: string): EventStore {
    let setup: EventSetup;
    try {
      const db = new DatabaseSync(backupFile, { readOnly: true });
      try {
        const row = db.prepare('SELECT setup_json FROM event').get() as
          { setup_json: string } | undefined;
        if (!row) throw new Error('no event');
        setup = JSON.parse(row.setup_json) as EventSetup;
      } finally {
        db.close();
      }
    } catch {
      throw new DamagedFileError("this isn't a tScore event backup");
    }
    const when = this.#now().toISOString().slice(0, 16).replace('T', ' ').replace(':', '');
    const date = setup.days[0]?.date ?? this.#now().toISOString().slice(0, 10);
    const base = join(this.eventsDir, `${date} ${setup.event.code} restored ${when}`);
    let folder = base;
    for (let n = 2; existsSync(folder); n++) folder = `${base} (${n})`;
    mkdirSync(folder, { recursive: true });
    let store: EventStore;
    try {
      copyFileSync(backupFile, join(folder, EVENT_FILE));
      store = EventStore.open(folder, this.context());
    } catch (err) {
      rmSync(folder, { recursive: true, force: true });
      throw err;
    }
    store.noteRestored(basename(backupFile));
    return this.#use(store);
  }

  #use(store: EventStore): EventStore {
    this.close();
    this.#current = store;
    this.#remember(store);
    return store;
  }

  #remember(store: EventStore): void {
    const { event, days } = store.setup;
    const entry: StoredRecent = {
      folder: resolve(store.folder),
      name: event.name,
      code: event.code,
      ...(days[0]?.date !== undefined && { date: days[0].date }),
      days: days.length,
      lastOpened: this.#now().toISOString(),
    };
    const key = folderKey(entry.folder);
    const rest = this.#readRecent().filter((r) => folderKey(r.folder) !== key);
    this.#writeRecent([entry, ...rest].slice(0, RECENT_MAX));
  }

  #readRecent(): StoredRecent[] {
    const data = readJson<{ events?: unknown }>(join(this.#settingsDir, RECENT_FILE));
    if (!Array.isArray(data?.events)) return [];
    return data.events.filter(isStoredRecent);
  }

  #writeRecent(events: StoredRecent[]): void {
    writeJson(join(this.#settingsDir, RECENT_FILE), { events });
  }
}

/** An event code as part of a folder name: no characters Windows refuses. */
function safeName(code: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are what's being removed
  return code.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'event';
}

/** Windows paths are case-insensitive. */
function folderKey(folder: string): string {
  const p = resolve(folder);
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

function isStoredRecent(x: unknown): x is StoredRecent {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r['folder'] === 'string' &&
    typeof r['name'] === 'string' &&
    typeof r['code'] === 'string' &&
    typeof r['days'] === 'number' &&
    typeof r['lastOpened'] === 'string' &&
    (r['date'] === undefined || typeof r['date'] === 'string')
  );
}

/** Club names match whatever their case and spacing: "Example MCC" is "example  mcc". */
function clubKey(club: string): string {
  return club.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** A settings file, or undefined if it's missing or unreadable (settings are never critical). */
function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** Write via a temporary file and rename, so a crash never leaves half a settings file. */
function writeJson(file: string, data: unknown): void {
  mkdirSync(resolve(file, '..'), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}
