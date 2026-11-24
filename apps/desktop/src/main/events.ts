/**
 * Events in the main process: the one EventLibrary, and the IPC handlers the event screens use.
 * The renderer never touches files; it asks for these and shows the outcome.
 */
import { statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import {
  CARD_PROFILE_ROWS,
  classesFromSetup,
  DEFAULT_CARD_PROFILE,
  ImportError,
  planImport,
  readEntryList,
  scoringFromSetup,
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
  CardDesk,
  DeskRider,
  EntryListFile,
  ExportKind,
  LabelOffset,
  LabelRequest,
  LabelsView,
  NewPenalty,
  OpenEvent,
  Outcome,
  PenaltyReason,
  RecentEventInfo,
  ResultsView,
  RiderChange,
  RiderInfo,
  SaveCard,
} from '../shared/ipc';
import { labelsView, saveLabels, saveLabelTestPage, setLabelOffset } from './labels';
import { exportResults, openLastExport, resultsView } from './results';

const PENALTY_REASONS: readonly PenaltyReason[] = [
  'time',
  'dissent',
  'outside_assistance',
  'course_cutting',
  'other',
];

const isWhole = (n: unknown, min = 1): n is number => Number.isInteger(n) && (n as number) >= min;

function cardDesk(store: EventStore): CardDesk {
  const classes = new Map(classesFromSetup(store.setup).map((c) => [c.name, c]));
  const riders: DeskRider[] = store.entries().map((e) => {
    const cls = classes.get(e.classes[0] ?? '');
    const rides: Record<number, { sections: number; laps: number }> = {};
    for (const d of cls?.days ?? []) rides[d.day] = { sections: d.sections, laps: d.laps };
    return { ...rider(e), rides };
  });
  const profile = store.setup.event.card_profile ?? DEFAULT_CARD_PROFILE;
  return {
    riders,
    cards: store.cardLog(),
    penalties: store.penaltyList().map((p) => ({
      id: p.id,
      number: p.number,
      points: p.points,
      reason: p.reason,
      createdAt: p.createdAt,
      ...(p.note !== undefined && { note: p.note }),
      ...(p.day !== undefined && { day: p.day }),
      ...(p.lap !== undefined && { lap: p.lap }),
    })),
    scoreValues: scoringFromSetup(store.setup).scoreValues,
    cardRows: CARD_PROFILE_ROWS[profile] ?? 16,
    days: store.setup.days.map((d) => ({ day: d.day, ...(d.date ? { date: d.date } : {}) })),
  };
}

let library: EventLibrary | null = null;

/** The entry list the desk last picked, waiting for "Import". Only its scoring columns. */
let pending: { eventId: string; list: EntryList } | null = null;

const COMPETITION_STATUSES = ['competitive', 'no_award', 'non_competitive'] as const;
const STATUSES = ['riding', 'dnf', 'dns'] as const;

function rider(e: EntryInput, printed?: ReadonlySet<number>): RiderInfo {
  return {
    number: e.number,
    riders: e.riders.map((p) => ({ givenName: p.givenName, familyName: p.familyName })),
    ...(e.club ? { club: e.club } : {}),
    ...(e.machine ? { machine: e.machine } : {}),
    ...(printed?.has(e.number) && { labelsPrinted: true }),
    competitionStatus: e.competitionStatus,
    status: e.status,
    classes: e.classes,
  };
}

/** Every rider, as the Riders screen shows them. */
function ridersOf(store: EventStore): RiderInfo[] {
  const printed = new Set(store.printedLabels().map((l) => l.number));
  return store.entries().map((e) => rider(e, printed));
}

const isText = (v: unknown): v is string | null => v === null || typeof v === 'string';

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

/** A file's size in bytes, or null if it can't be read. */
function fileSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

/** Errors the desk can act on come back as an Outcome; anything else is logged and summarised. */
function attempt<T>(what: string, fn: () => T): Outcome<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return failed(what, err);
  }
}

async function attemptAsync<T>(what: string, fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return failed(what, err);
  }
}

function failed(what: string, err: unknown): { ok: false; error: AppError } {
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
    const store = library?.current;
    return store ? ridersOf(store) : [];
  },

  updateRider(number: number, change: RiderChange): Outcome<RiderInfo[]> {
    return attempt('changing a rider', () => {
      const store = openStore();
      if (!Number.isInteger(number)) throw new StoreError('APP_BAD_REQUEST', 'No such rider.');
      if (change.riders !== undefined) {
        const ok =
          Array.isArray(change.riders) &&
          change.riders.every(
            (p) => typeof p?.givenName === 'string' && typeof p?.familyName === 'string',
          );
        if (!ok) throw new StoreError('APP_BAD_REQUEST', 'Give the rider a name.');
        store.renameRiders(number, change.riders);
      }
      if (change.club !== undefined) {
        if (!isText(change.club)) throw new StoreError('APP_BAD_REQUEST', 'Type a club.');
        store.setClub(number, change.club);
      }
      if (change.machine !== undefined) {
        if (!isText(change.machine)) throw new StoreError('APP_BAD_REQUEST', 'Type a machine.');
        store.setMachine(number, change.machine);
      }
      if (change.classes !== undefined) {
        if (!Array.isArray(change.classes) || !change.classes.every((c) => typeof c === 'string'))
          throw new StoreError('APP_BAD_REQUEST', 'Choose a class.');
        store.changeClasses(number, change.classes);
      }
      if (change.competitionStatus !== undefined) {
        if (!COMPETITION_STATUSES.includes(change.competitionStatus))
          throw new StoreError('APP_BAD_REQUEST', 'Choose a competition status.');
        store.setCompetitionStatus(number, change.competitionStatus);
      }
      if (change.status !== undefined) {
        if (!STATUSES.includes(change.status))
          throw new StoreError('APP_BAD_REQUEST', 'Choose a riding status.');
        store.setStatus(number, change.status);
      }
      log.info('rider changed', { eventId: store.eventId, number, fields: Object.keys(change) });
      return ridersOf(store);
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
      let list: EntryList;
      try {
        list = readEntryList(readEntryFile(file));
      } catch (err) {
        // What kind of file it was, so a support log can say why (never its contents or name).
        log.warn('entry list not read', {
          type: extname(file).toLowerCase(),
          bytes: fileSize(file),
          code: (err as { code?: string }).code,
          ...(err instanceof ImportError && err.diagnostics),
        });
        throw err;
      }
      pending = { eventId: store.eventId, list };
      log.info('entry list read', { source: list.presetId, rows: list.rows.length });
      return { fileName: basename(file), list };
    });
  },

  cardDesk(): Outcome<CardDesk> {
    return attempt('reading the cards', () => cardDesk(openStore()));
  },

  saveCard(card: SaveCard): Outcome<CardDesk> {
    return attempt('saving a card', () => {
      const store = openStore();
      if (
        typeof card !== 'object' ||
        !isWhole(card.number) ||
        !isWhole(card.day) ||
        !isWhole(card.lap) ||
        !Array.isArray(card.scores) ||
        !card.scores.every((s) => isWhole(s, 0))
      ) {
        throw new StoreError('APP_BAD_REQUEST', 'That card is incomplete.');
      }
      const where = { number: card.number, day: card.day, lap: card.lap };
      if (card.editing) {
        const changed = store.amendCard({ ...where, scores: card.scores, source: 'amend' });
        log.info('card edited', { eventId: store.eventId, ...where, sections: changed });
      } else {
        store.recordCard({
          ...where,
          scores: card.scores,
          source: 'manual',
          ...(typeof card.receivedAt === 'string' && { receivedAt: card.receivedAt }),
        });
        log.info('card typed', { eventId: store.eventId, ...where });
      }
      return cardDesk(store);
    });
  },

  addPenalty(p: NewPenalty): Outcome<CardDesk> {
    return attempt('adding a penalty', () => {
      const store = openStore();
      if (
        typeof p !== 'object' ||
        !isWhole(p.number) ||
        !isWhole(p.points) ||
        !PENALTY_REASONS.includes(p.reason) ||
        (p.day !== undefined && !isWhole(p.day)) ||
        (p.lap !== undefined && !isWhole(p.lap)) ||
        (p.note !== undefined && typeof p.note !== 'string')
      ) {
        throw new StoreError('APP_BAD_REQUEST', 'That penalty is incomplete.');
      }
      const note = p.note?.trim();
      if (p.reason === 'other' && !note) {
        throw new StoreError('APP_PENALTY_NOTE', 'Say what the penalty is for.');
      }
      store.addPenalty(p.number, {
        points: p.points,
        reason: p.reason,
        ...(note ? { note } : {}),
        ...(p.day !== undefined && { day: p.day }),
        ...(p.lap !== undefined && { lap: p.lap }),
      });
      log.info('penalty added', { eventId: store.eventId, number: p.number, reason: p.reason });
      return cardDesk(store);
    });
  },

  removePenalty(id: string): Outcome<CardDesk> {
    return attempt('removing a penalty', () => {
      const store = openStore();
      if (typeof id !== 'string') throw new StoreError('APP_BAD_REQUEST', 'No such penalty.');
      store.removePenalty(id);
      log.info('penalty removed', { eventId: store.eventId });
      return cardDesk(store);
    });
  },

  results(): Outcome<ResultsView> {
    return attempt('working out results', () => resultsView(openStore()));
  },

  exportResults(
    kind: ExportKind,
    juniorInitials: boolean,
    win: BrowserWindow | null,
  ): Promise<Outcome<string | null>> {
    return attemptAsync('saving results', async () => {
      const store = openStore();
      const path = await exportResults(store, kind, juniorInitials, win);
      if (path) log.info('results saved', { eventId: store.eventId, kind, juniorInitials });
      return path;
    });
  },

  labels(request: LabelRequest): Outcome<LabelsView> {
    return attempt('planning card labels', () => labelsView(openStore(), request));
  },

  saveLabels(
    request: LabelRequest,
    win: BrowserWindow | null,
  ): Promise<Outcome<{ path: string; labels: number } | null>> {
    return attemptAsync('saving card labels', async () => {
      const store = openStore();
      const saved = await saveLabels(store, request, win);
      if (saved) {
        log.info('card labels saved', {
          eventId: store.eventId,
          labels: saved.labels,
          which: typeof request.which === 'object' ? 'rider' : request.which,
        });
      }
      return saved;
    });
  },

  saveLabelTestPage(win: BrowserWindow | null): Promise<Outcome<string | null>> {
    return attemptAsync('saving the alignment test page', () =>
      saveLabelTestPage(openStore(), win),
    );
  },

  setLabelOffset(offset: LabelOffset): Outcome<LabelOffset> {
    return attempt('saving the printer offset', () => {
      const saved = setLabelOffset(offset);
      log.info('label printer offset set', saved);
      return saved;
    });
  },

  openExport(): Promise<Outcome<null>> {
    return attemptAsync('opening the saved results', async () => {
      await openLastExport();
      return null;
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
