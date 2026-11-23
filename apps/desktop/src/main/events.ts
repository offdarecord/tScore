/**
 * Events in the main process: the one EventLibrary, and the IPC handlers the event screens use.
 * The renderer never touches files; it asks for these and shows the outcome.
 */
import { dirname, join } from 'node:path';
import type { EventSetup } from '@tscore/core';
import { EventLibrary, SetupError, StoreError, type EventStore } from '@tscore/store';
import { app, dialog, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import type { AppError, OpenEvent, Outcome, RecentEventInfo } from '../shared/ipc';

let library: EventLibrary | null = null;

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
    } else if (err instanceof StoreError) {
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
    events().close();
    if (id) log.info('event closed', { eventId: id });
  },
};
