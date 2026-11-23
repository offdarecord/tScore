/**
 * Events in the main process: the one EventLibrary, and the IPC handlers the event screens use.
 * The renderer never touches files; it asks for these and shows the outcome.
 */
import { basename, dirname, join } from 'node:path';
import {
  ImportError,
  planImport,
  readEntryList,
  type EntryInput,
  type EntryList,
  type EventSetup,
  type ImportChoices,
} from '@tscore/core';
import {
  EventLibrary,
  readEntryFile,
  SetupError,
  StoreError,
  type EventStore,
} from '@tscore/store';
import { app, dialog, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import type {
  AppError,
  EntryListFile,
  OpenEvent,
  Outcome,
  RecentEventInfo,
  RiderChange,
  RiderInfo,
} from '../shared/ipc';

let library: EventLibrary | null = null;

/** The entry list the desk last picked, waiting for "Import". Only its scoring columns. */
let pending: { eventId: string; list: EntryList } | null = null;

const TIERS = ['competitive', 'no_award', 'non_competitive'] as const;
const STATUSES = ['riding', 'dnf', 'dns'] as const;

function rider(e: EntryInput): RiderInfo {
  return {
    number: e.number,
    riders: e.riders.map((p) => ({ givenName: p.givenName, familyName: p.familyName })),
    ...(e.club ? { club: e.club } : {}),
    tier: e.tier,
    status: e.status,
    classes: e.classes,
  };
}

function openStore(): EventStore {
  const store = library?.current;
  if (!store) throw new StoreError('APP_NO_EVENT', 'No event is open.');
  return store;
}

/** Events are saved in Documents\tScore. Tests point this elsewhere. */
export function eventsDir(): string {
  const testDir = process.env['TSCORE_TEST_EVENTS_DIR'];
  if (testDir && !app.isPackaged) return testDir;
  return join(app.getPath('documents'), 'tScore');
}

export function events(): EventLibrary {
  library ??= new EventLibrary({
    settingsDir: app.getPath('userData'),
    eventsDir: eventsDir(),
    appVersion: app.getVersion(),
  });
  return library;
}

/** Updates wait while an event is open (ADR 0011). */
export function isEventOpen(): boolean {
  return library?.current !== null && library?.current !== undefined;
}

export function closeEvents(): void {
  library?.close();
}

function describe(store: EventStore): OpenEvent {
  const ridersByClass: Record<string, number> = {};
  const entries = store.entries();
  for (const e of entries)
    for (const c of e.classes) ridersByClass[c] = (ridersByClass[c] ?? 0) + 1;
  return {
    folder: store.folder,
    setup: store.setup,
    ridersByClass,
    riders: entries.length,
    cards: store.cards().length,
  };
}

/** Errors the desk can act on come back as an Outcome; anything else is logged and summarised. */
function attempt<T>(what: string, fn: () => T): Outcome<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    log.warn(`${what} failed`, err);
    let error: AppError;
    if (err instanceof SetupError) {
      error = { code: err.code, message: err.message, issues: err.issues };
    } else if (err instanceof StoreError || err instanceof ImportError) {
      error = { code: err.code, message: err.message };
    } else {
      error = {
        code: 'APP_UNEXPECTED',
        message: `Something went wrong (${what}). The details are in tScore's log.`,
      };
    }
    return { ok: false, error };
  }
}

export const eventHandlers = {
  recent(): RecentEventInfo[] {
    return events().recent();
  },

  create(setup: EventSetup): Outcome<OpenEvent> {
    return attempt('creating the event', () => {
      const store = events().create(setup);
      log.info('event created', { eventId: store.eventId, folder: store.folder });
      return describe(store);
    });
  },

  async openFile(win: BrowserWindow | null): Promise<Outcome<OpenEvent | null>> {
    const options: Electron.OpenDialogOptions = {
      title: 'Open an event',
      defaultPath: eventsDir(),
      properties: ['openFile'],
      filters: [{ name: 'tScore event', extensions: ['sqlite'] }],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return { ok: true, value: null };
    return this.open(dirname(file));
  },

  /** Only folders the library knows (recent list), or from the open dialog. */
  openRecent(folder: string): Outcome<OpenEvent> {
    if (typeof folder !== 'string' || !events().isRecent(folder)) {
      return {
        ok: false,
        error: { code: 'APP_NOT_RECENT', message: "That event isn't in the recent list." },
      };
    }
    return this.open(folder);
  },

  open(folder: string): Outcome<OpenEvent> {
    return attempt('opening the event', () => {
      const store = events().open(folder);
      log.info('event opened', { eventId: store.eventId, folder: store.folder });
      return describe(store);
    });
  },

  forget(folder: string): void {
    if (typeof folder === 'string') events().forget(folder);
  },

  current(): OpenEvent | null {
    const store = library?.current;
    return store ? describe(store) : null;
  },

  updateSetup(setup: EventSetup): Outcome<OpenEvent> {
    return attempt('saving the event setup', () => {
      const store = events().updateSetup(setup);
      log.info('event setup saved', { eventId: store.eventId });
      return describe(store);
    });
  },

  close(): void {
    const id = library?.current?.eventId;
    pending = null;
    events().close();
    if (id) log.info('event closed', { eventId: id });
  },

  riders(): RiderInfo[] {
    return library?.current?.entries().map(rider) ?? [];
  },

  updateRider(number: number, change: RiderChange): Outcome<RiderInfo[]> {
    return attempt('changing a rider', () => {
      const store = openStore();
      if (!Number.isInteger(number)) throw new StoreError('APP_BAD_REQUEST', 'No such rider.');
      if (change.classes !== undefined) {
        if (!Array.isArray(change.classes) || !change.classes.every((c) => typeof c === 'string'))
          throw new StoreError('APP_BAD_REQUEST', 'Choose a class.');
        store.changeClasses(number, change.classes);
      }
      if (change.tier !== undefined) {
        if (!TIERS.includes(change.tier)) throw new StoreError('APP_BAD_REQUEST', 'Choose a tier.');
        store.setTier(number, change.tier);
      }
      if (change.status !== undefined) {
        if (!STATUSES.includes(change.status))
          throw new StoreError('APP_BAD_REQUEST', 'Choose a riding status.');
        store.setStatus(number, change.status);
      }
      log.info('rider changed', { eventId: store.eventId, number, fields: Object.keys(change) });
      return store.entries().map(rider);
    });
  },

  async chooseEntryList(win: BrowserWindow | null): Promise<Outcome<EntryListFile | null>> {
    const options: Electron.OpenDialogOptions = {
      title: 'Import riders from an entry list',
      defaultPath: app.getPath('downloads'),
      properties: ['openFile'],
      filters: [{ name: 'Entry list', extensions: ['xlsx', 'xls', 'csv'] }],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return { ok: true, value: null };
    return attempt('reading the entry list', () => {
      const store = openStore();
      // Only the preset's columns survive this line; the rest of the file is dropped here.
      const list = readEntryList(readEntryFile(file));
      pending = { eventId: store.eventId, list };
      log.info('entry list read', { source: list.presetId, rows: list.rows.length });
      return { fileName: basename(file), list };
    });
  },

  importRiders(choices: ImportChoices): Outcome<OpenEvent> {
    return attempt('importing riders', () => {
      const store = openStore();
      if (!pending || pending.eventId !== store.eventId) {
        throw new StoreError('APP_NO_ENTRY_LIST', 'Choose the entry list again.');
      }
      // Worked out again here from the event as saved, not taken from the window.
      const plan = planImport(pending.list, store.setup, store.entries(), choices ?? {});
      if (!plan.ready) {
        throw new StoreError(
          'APP_IMPORT_NOT_READY',
          'Some class names or double entries still need a decision.',
        );
      }
      store.importEntries(plan.entries, plan.newAliases, pending.list.source);
      log.info('riders imported', {
        eventId: store.eventId,
        source: pending.list.presetId,
        riders: plan.entries.length,
        aliases: plan.newAliases.length,
      });
      pending = null;
      return describe(store);
    });
  },
};
