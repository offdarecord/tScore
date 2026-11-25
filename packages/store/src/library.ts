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
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { validateEventSetup, type EventSetup } from '@tscore/core';
import { DamagedFileError, SetupError, StoreError } from './errors.js';
import { EVENT_FILE, EventStore, type StoreContext } from './event-store.js';
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
const STATION_FILE = 'station.json';
const RECENT_MAX = 20;

type StoredRecent = Omit<RecentEvent, 'missing'>;

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
    if (!store) throw new StoreError('STORE_NO_EVENT', 'No event is open.');
    store.noteMovedOut(basename(file));
    const data = packEvent(store, this.#appVersion, this.#now());
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, data);
    renameSync(tmp, file);
    const { manifest } = unpackEvent(readFileSync(file));
    return { bytes: data.length, files: manifest.files.length };
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

  /** Make a new event and open it (closing any open event). */
  create(setup: unknown): EventStore {
    const r = validateEventSetup(setup);
    if (!r.ok) throw new SetupError(r.issues);
    mkdirSync(this.eventsDir, { recursive: true });
    return this.#use(EventStore.create(this.folderFor(r.value), r.value, this.context()));
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
    if (!store) throw new StoreError('STORE_NO_EVENT', 'No event is open.');
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
