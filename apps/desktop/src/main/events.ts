/**
 * Events in the main process: the one EventLibrary, and the IPC handlers the event screens use.
 * The renderer never touches files; it asks for these and shows the outcome.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import {
  CARD_PROFILE_ROWS,
  classesFromSetup,
  CLUB_MAX,
  DEFAULT_CARD_PROFILE,
  MACHINE_MAX,
  NAME_MAX,
  ImportError,
  planImport,
  readEntryList,
  scoringFromSetup,
  type EntryInput,
  type EntryList,
  type EventSetup,
  type ImportChoices,
  type SeriesRules,
  publicErrorCode,
  checkTestTrial,
  isTestTrialKey,
  type TestTrialCheck,
} from '@tscore/core';
import {
  EventLibrary,
  LOGO_MAX_BYTES,
  MOVE_EXTENSION,
  readEntryFile,
  SetupError,
  StoreError,
  type EventStore,
} from '@tscore/store';
import { app, dialog, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { t } from './i18n';
import type {
  AppError,
  CardDesk,
  DecideScores,
  ReviewItem,
  SaveScan,
  DeskRider,
  EntryListFile,
  BackupStatus,
  PreEventCheck,
  CourseView,
  ExportKind,
  LabelOffset,
  NewRider,
  LabelRequest,
  LabelsView,
  LiveScores,
  LogoView,
  NewPenalty,
  OpenEvent,
  Outcome,
  PenaltyReason,
  RecentEventInfo,
  ResultsView,
  SeriesView,
  SeriesSummary,
  SeriesChange,
  RiderChange,
  RiderInfo,
  SaveCard,
} from '../shared/ipc';
import { backUp, backupStatus, beforeClose, setSecondPlace } from './backups';
import { preEventCheck } from './check';
import { courseView } from './course';
import { labelsView, saveLabels, saveLabelTestPage, setLabelOffset } from './labels';
import {
  exportSeries,
  newSeries,
  removeSeries,
  seriesSummaries,
  seriesView,
  updateSeries,
} from './series';
import { exportResults, liveScores, markFinal, openLastExport, resultsView } from './results';

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

/** Series rules from the window: whole points that don't go up, a sane best-of, a known tie rule. */
function checkRules(rules: SeriesRules): void {
  const ok =
    Array.isArray(rules.points) &&
    rules.points.length > 0 &&
    rules.points.length <= 100 &&
    rules.points.every((p, i) => isWhole(p, 0) && p <= (rules.points[i - 1] ?? Infinity)) &&
    (rules.bestOf === undefined || isWhole(rules.bestOf, 1)) &&
    (rules.ties === 'share' || rules.ties === 'split');
  if (!ok)
    throw new StoreError('APP_BAD_REQUEST', 'The series rules are not valid.', {
      key: 'errors.APP_BAD_REQUEST_3',
    });
}

function reviewItems(store: EventStore): ReviewItem[] {
  const riders = new Map(ridersOf(store).map((r) => [r.number, r]));
  const current = new Map(store.cardLog().map((c) => [`${c.number}/${c.day}/${c.lap}`, c.scores]));
  return store.reviewCards().map((c) => {
    const r = riders.get(c.number);
    return {
      number: c.number,
      day: c.day,
      lap: c.lap,
      name: r ? r.riders.map((p) => `${p.givenName} ${p.familyName}`).join(' & ') : '',
      className: r?.classes[0] ?? '',
      imagePath: c.imagePath,
      receivedAt: c.receivedAt,
      scores: current.get(`${c.number}/${c.day}/${c.lap}`) ?? [],
      sections: c.sections,
    };
  });
}

function logoViews(store: EventStore): LogoView[] {
  return store.logos().flatMap((l) => {
    const data = store.logoData(l.id);
    return data
      ? [
          {
            id: l.id,
            role: l.role,
            bytes: l.bytes,
            uri: `data:${l.mime};base64,${Buffer.from(data).toString('base64')}`,
          },
        ]
      : [];
  });
}

function openStore(): EventStore {
  const store = library?.current;
  if (!store)
    throw new StoreError('APP_NO_EVENT', 'No event is open.', { key: 'errors.APP_NO_EVENT' });
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
    beforeClose,
  });
  return library;
}

/** The open event, if any (for the backup timer). */
export function currentStore(): EventStore | null {
  return library?.current ?? null;
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
export function attempt<T>(what: string, fn: () => T): Outcome<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return failed(what, err);
  }
}

export async function attemptAsync<T>(what: string, fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return failed(what, err);
  }
}

/** Remember the event's club logo for the club's next events, whichever was filled in first. */
function rememberClubLogo(store: EventStore): void {
  const club = store.setup.event.club;
  const logo = store.logos().find((l) => l.role === 'club');
  const data = logo && store.logoData(logo.id);
  if (club && data) events().rememberClubLogo(club, data);
}

function failed(what: string, err: unknown): { ok: false; error: AppError } {
  let error: AppError;
  if (err instanceof SetupError) {
    error = { code: publicErrorCode(err.code), message: err.message, issues: err.issues };
  } else if (err instanceof StoreError || err instanceof ImportError) {
    // The English is the fallback, so a message missing from the laptop's language still reads.
    const message = err.words
      ? t(err.words.key, { ...err.words.values, defaultValue: err.message })
      : err.message;
    error = { code: publicErrorCode(err.code), message };
  } else {
    error = {
      code: publicErrorCode('APP_UNEXPECTED'),
      message: t('errors.APP_UNEXPECTED', { what }),
    };
  }
  log.warn(`${what} failed`, { code: error.code }, err);
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
      title: t('dialog.openEvent'),
      defaultPath: eventsDir(),
      properties: ['openFile'],
      filters: [{ name: t('dialog.tscoreEvent'), extensions: ['sqlite', MOVE_EXTENSION] }],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return { ok: true, value: null };
    if (extname(file).toLowerCase() === `.${MOVE_EXTENSION}`) {
      return attempt('opening the event from another laptop', () => {
        const store = events().openMoved(file);
        log.info('event opened from another laptop', {
          eventId: store.eventId,
          folder: store.folder,
        });
        return describe(store);
      });
    }
    return this.open(dirname(file));
  },

  async saveForMove(
    win: BrowserWindow | null,
  ): Promise<Outcome<{ file: string; bytes: number; files: number } | null>> {
    const store = library?.current;
    const date = store?.setup.days[0]?.date ?? '';
    const options: Electron.SaveDialogOptions = {
      title: t('dialog.saveForMove'),
      defaultPath: join(
        app.getPath('documents'),
        `${date} ${store?.setup.event.code ?? 'event'}.${MOVE_EXTENSION}`.trim(),
      ),
      filters: [{ name: t('dialog.tscoreEvent'), extensions: [MOVE_EXTENSION] }],
    };
    const picked = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { ok: true, value: null };
    const file = picked.filePath;
    return attempt('saving a copy for another laptop', () => {
      const saved = events().saveForMove(file);
      log.info('event saved for another laptop', {
        eventId: openStore().eventId,
        bytes: saved.bytes,
        files: saved.files,
      });
      return { file, ...saved };
    });
  },

  /** Only folders the library knows (recent list), or from the open dialog. */
  openRecent(folder: string): Outcome<OpenEvent> {
    if (typeof folder !== 'string' || !events().isRecent(folder)) {
      return {
        ok: false,
        error: {
          code: publicErrorCode('APP_NOT_RECENT'),
          message: "That event isn't in the recent list.",
        },
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

  preEventCheck(): Outcome<PreEventCheck> {
    return attempt('checking the event', () => preEventCheck(openStore()));
  },

  backupStatus(): Outcome<BackupStatus> {
    return attempt('checking backups', () => backupStatus(openStore()));
  },

  backupNow(): Outcome<BackupStatus> {
    return attempt('making a backup', () => {
      const store = openStore();
      backUp(store, 'manual');
      return backupStatus(store);
    });
  },

  async chooseBackupPlace(win: BrowserWindow | null): Promise<Outcome<BackupStatus | null>> {
    const options: Electron.OpenDialogOptions = {
      title: t('dialog.secondPlace'),
      properties: ['openDirectory', 'createDirectory'],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const folder = picked.filePaths[0];
    if (picked.canceled || !folder) return { ok: true, value: null };
    return attempt('setting the backup place', () => {
      const store = openStore();
      setSecondPlace(folder);
      backUp(store, 'manual');
      return backupStatus(store);
    });
  },

  clearBackupPlace(): Outcome<BackupStatus> {
    return attempt('clearing the backup place', () => {
      setSecondPlace(null);
      return backupStatus(openStore());
    });
  },

  async restoreFromBackup(
    win: BrowserWindow | null,
  ): Promise<Outcome<{ event: OpenEvent; from: string } | null>> {
    const options: Electron.OpenDialogOptions = {
      title: t('dialog.restore'),
      defaultPath: library?.current ? join(library.current.folder, 'backups') : eventsDir(),
      properties: ['openFile'],
      filters: [{ name: t('dialog.tscoreBackup'), extensions: ['sqlite'] }],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return { ok: true, value: null };
    return attempt('restoring from a backup', () => {
      const store = events().restore(file);
      log.info('event restored from a backup', { eventId: store.eventId, folder: store.folder });
      return { event: describe(store), from: basename(file) };
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
      rememberClubLogo(store);
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
      if (!Number.isInteger(number))
        throw new StoreError('APP_BAD_REQUEST', 'No such rider.', {
          key: 'errors.APP_BAD_REQUEST_4',
        });
      if (change.riders !== undefined) {
        const ok =
          Array.isArray(change.riders) &&
          change.riders.every(
            (p) => typeof p?.givenName === 'string' && typeof p?.familyName === 'string',
          );
        if (!ok)
          throw new StoreError('APP_BAD_REQUEST', 'Give the rider a name.', {
            key: 'errors.APP_BAD_REQUEST_5',
          });
        store.renameRiders(number, change.riders);
      }
      if (change.club !== undefined) {
        if (!isText(change.club))
          throw new StoreError('APP_BAD_REQUEST', 'Type a club.', {
            key: 'errors.APP_BAD_REQUEST_6',
          });
        store.setClub(number, change.club);
      }
      if (change.machine !== undefined) {
        if (!isText(change.machine))
          throw new StoreError('APP_BAD_REQUEST', 'Type a machine.', {
            key: 'errors.APP_BAD_REQUEST_7',
          });
        store.setMachine(number, change.machine);
      }
      if (change.classes !== undefined) {
        if (!Array.isArray(change.classes) || !change.classes.every((c) => typeof c === 'string'))
          throw new StoreError('APP_BAD_REQUEST', 'Choose a class.', {
            key: 'errors.APP_BAD_REQUEST_8',
          });
        store.changeClasses(number, change.classes);
      }
      if (change.competitionStatus !== undefined) {
        if (!COMPETITION_STATUSES.includes(change.competitionStatus))
          throw new StoreError('APP_BAD_REQUEST', 'Choose a competition status.', {
            key: 'errors.APP_BAD_REQUEST_9',
          });
        store.setCompetitionStatus(number, change.competitionStatus);
      }
      if (change.status !== undefined) {
        if (!STATUSES.includes(change.status))
          throw new StoreError('APP_BAD_REQUEST', 'Choose a riding status.', {
            key: 'errors.APP_BAD_REQUEST_10',
          });
        store.setStatus(number, change.status);
      }
      log.info('rider changed', { eventId: store.eventId, number, fields: Object.keys(change) });
      return ridersOf(store);
    });
  },

  addLateEntry(rider: NewRider): Outcome<{ number: number; riders: RiderInfo[] }> {
    return attempt('adding a late entry', () => {
      const store = openStore();
      const tidy = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
      const people = Array.isArray(rider?.riders) ? rider.riders : [];
      const names = people.map((p) => ({
        givenName: tidy(p?.givenName),
        familyName: tidy(p?.familyName),
      }));
      if (
        names.length < 1 ||
        names.length > 2 ||
        names.some(
          (n) =>
            (!n.givenName && !n.familyName) ||
            n.givenName.length > NAME_MAX ||
            n.familyName.length > NAME_MAX,
        )
      ) {
        throw new StoreError('APP_BAD_REQUEST', 'Give the rider a first name or a surname.', {
          key: 'errors.APP_BAD_REQUEST_11',
        });
      }
      const club = tidy(rider.club);
      const machine = tidy(rider.machine);
      if (club.length > CLUB_MAX || machine.length > MACHINE_MAX) {
        throw new StoreError('APP_BAD_REQUEST', 'That club or machine is too long.', {
          key: 'errors.APP_BAD_REQUEST_12',
        });
      }
      const className = tidy(rider.className);
      const cls = store.setup.classes.find((c) => c.name === className);
      if (!cls)
        throw new StoreError('APP_BAD_REQUEST', 'Choose a class from the event setup.', {
          key: 'errors.APP_BAD_REQUEST_13',
        });
      if (!COMPETITION_STATUSES.includes(rider.competitionStatus)) {
        throw new StoreError('APP_BAD_REQUEST', 'Choose a competition status.', {
          key: 'errors.APP_BAD_REQUEST_9',
        });
      }
      const taken = new Set(store.entries().map((e) => e.number));
      // Numbers never move once issued: a late entry gets the next free number (decision 25).
      let number: number;
      if (rider.number === undefined) {
        number =
          taken.size > 0 ? Math.max(...taken) + 1 : (store.setup.event.first_rider_number ?? 1);
      } else {
        number = rider.number;
        if (!isWhole(number) || number < 1 || number > 9999) {
          throw new StoreError(
            'APP_BAD_REQUEST',
            'A rider number is a whole number from 1 to 9999.',
            { key: 'errors.APP_BAD_REQUEST_15' },
          );
        }
        if (taken.has(number)) {
          throw new StoreError('APP_NUMBER_TAKEN', `Rider number ${number} is already taken.`, {
            key: 'errors.APP_NUMBER_TAKEN',
            values: { number },
          });
        }
      }
      store.addEntry({
        number,
        riders: names,
        ...(club && { club }),
        ...(machine && { machine }),
        competitionStatus: rider.competitionStatus,
        status: 'riding',
        classes: [className],
      });
      log.info('late entry added', { eventId: store.eventId, number });
      return { number, riders: ridersOf(store) };
    });
  },

  async chooseEntryList(win: BrowserWindow | null): Promise<Outcome<EntryListFile | null>> {
    const options: Electron.OpenDialogOptions = {
      title: t('dialog.importRiders'),
      defaultPath: app.getPath('downloads'),
      properties: ['openFile'],
      filters: [{ name: t('dialog.entryList'), extensions: ['xlsx', 'xls', 'csv'] }],
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

  /** Check a Test trial rehearsal against the kit's answer key (#81). */
  async checkTestTrial(win: BrowserWindow | null): Promise<Outcome<TestTrialCheck | null>> {
    const options: Electron.OpenDialogOptions = {
      title: t('dialog.answerKey'),
      properties: ['openFile'],
      filters: [{ name: t('dialog.answerKeyType'), extensions: ['json'] }],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return { ok: true, value: null };
    return attempt('checking the test trial', () => {
      const store = openStore();
      let key: unknown;
      try {
        if (statSync(file).size > 1_000_000) throw new Error('too big');
        key = JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        key = undefined;
      }
      if (!isTestTrialKey(key)) {
        throw new StoreError('APP_NOT_A_KEY', "That file isn't a Test trial answer key.", {
          key: 'errors.APP_NOT_A_KEY',
        });
      }
      const riders = store.entries().map((e) => ({
        number: e.number,
        givenName: e.riders[0]?.givenName ?? '',
        familyName: e.riders[0]?.familyName ?? '',
      }));
      const result = checkTestTrial(key, riders, store.cardLog());
      log.info('test trial checked', {
        eventId: store.eventId,
        cards: result.cards,
        right: result.right,
      });
      return result;
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
        throw new StoreError('APP_BAD_REQUEST', 'That card is incomplete.', {
          key: 'errors.APP_BAD_REQUEST_16',
        });
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

  saveScan(scan: SaveScan): Outcome<CardDesk> {
    return attempt('saving a scanned card', () => {
      const store = openStore();
      const okScores =
        Array.isArray(scan?.scores) && scan.scores.every((s) => s === null || isWhole(s, 0));
      const image = scan?.image;
      const jpeg =
        image instanceof Uint8Array &&
        image.length > 3 &&
        image.length <= 8_000_000 &&
        image[0] === 0xff &&
        image[1] === 0xd8;
      if (
        !isWhole(scan?.number) ||
        !isWhole(scan.day) ||
        !isWhole(scan.lap) ||
        !okScores ||
        !jpeg
      ) {
        throw new StoreError('APP_BAD_REQUEST', 'That scan is incomplete.', {
          key: 'errors.APP_BAD_REQUEST_17',
        });
      }
      const words = (xs: unknown) =>
        Array.isArray(xs) ? xs.map((x) => (typeof x === 'string' ? x.slice(0, 20) : null)) : [];
      const nums = (xs: unknown) =>
        Array.isArray(xs)
          ? xs.map((x) => (typeof x === 'number' && x >= 0 && x <= 1 ? x : null))
          : [];
      const stampNow = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
      const name = `${scan.number}-${scan.day}-${scan.lap}-${stampNow}.jpg`;
      const imagePath = `cards/${name}`;
      writeFileSync(join(store.folder, 'cards', name), image);
      store.recordCard({
        number: scan.number,
        day: scan.day,
        lap: scan.lap,
        scores: scan.scores,
        source: 'scan',
        confidence: nums(scan.confidence),
        reasons: words(scan.reasons),
        imagePath,
      });
      const undecided = scan.scores.filter((s) => s === null).length;
      log.info('card scanned', {
        eventId: store.eventId,
        number: scan.number,
        day: scan.day,
        lap: scan.lap,
        undecided,
      });
      return cardDesk(store);
    });
  },

  reviewQueue(): Outcome<ReviewItem[]> {
    return attempt('listing cards to review', () => reviewItems(openStore()));
  },

  cardImage(path: string): Outcome<string> {
    return attempt('opening the card photo', () => {
      const store = openStore();
      // Only photos in this event's cards folder.
      if (typeof path !== 'string' || !/^cards\/[\w.-]+\.jpg$/.test(path)) {
        throw new StoreError('APP_BAD_REQUEST', "That isn't a card photo.", {
          key: 'errors.APP_BAD_REQUEST_18',
        });
      }
      const data = readFileSync(join(store.folder, path));
      return `data:image/jpeg;base64,${data.toString('base64')}`;
    });
  },

  decideScores(d: DecideScores): Outcome<ReviewItem[]> {
    return attempt('saving the decided scores', () => {
      const store = openStore();
      if (
        !isWhole(d?.number) ||
        !isWhole(d.day) ||
        !isWhole(d.lap) ||
        !Array.isArray(d.scores) ||
        !d.scores.every((s) => isWhole(s?.section) && isWhole(s.value, 0))
      ) {
        throw new StoreError('APP_BAD_REQUEST', 'Choose a score for each section.', {
          key: 'errors.APP_BAD_REQUEST_19',
        });
      }
      for (const s of d.scores) {
        store.correctScore({
          number: d.number,
          day: d.day,
          lap: d.lap,
          section: s.section,
          value: s.value,
          source: 'review',
        });
      }
      log.info('scan reviewed', {
        eventId: store.eventId,
        number: d.number,
        sections: d.scores.length,
      });
      return reviewItems(store);
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
        throw new StoreError('APP_BAD_REQUEST', 'That penalty is incomplete.', {
          key: 'errors.APP_BAD_REQUEST_20',
        });
      }
      const note = p.note?.trim();
      if (p.reason === 'other' && !note) {
        throw new StoreError('APP_PENALTY_NOTE', 'Say what the penalty is for.', {
          key: 'errors.APP_PENALTY_NOTE',
        });
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
      if (typeof id !== 'string')
        throw new StoreError('APP_BAD_REQUEST', 'No such penalty.', {
          key: 'errors.APP_BAD_REQUEST_21',
        });
      store.removePenalty(id);
      log.info('penalty removed', { eventId: store.eventId });
      return cardDesk(store);
    });
  },

  logos(): Outcome<LogoView[]> {
    return attempt('reading the logos', () => logoViews(openStore()));
  },

  async chooseLogo(
    role: 'event' | 'club' | 'sponsor',
    win: BrowserWindow | null,
  ): Promise<Outcome<LogoView[] | null>> {
    if (role !== 'event' && role !== 'club' && role !== 'sponsor') return { ok: true, value: null };
    const options: Electron.OpenDialogOptions = {
      title:
        role === 'event'
          ? t('dialog.eventLogo')
          : role === 'club'
            ? t('dialog.clubLogo')
            : t('dialog.sponsorLogo'),
      properties: ['openFile'],
      filters: [{ name: t('dialog.picture'), extensions: ['png', 'jpg', 'jpeg'] }],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return { ok: true, value: null };
    return attempt('adding the logo', () => {
      const store = openStore();
      const size = statSync(file).size;
      if (size > LOGO_MAX_BYTES) {
        throw new StoreError(
          'STORE_LOGO_SIZE',
          `That picture is ${(size / 1_000_000).toFixed(1)} MB. Logos can be up to 1 MB: save a smaller copy.`,
          { key: 'errors.STORE_LOGO_SIZE', values: { size: (size / 1_000_000).toFixed(1) } },
        );
      }
      const added = store.addLogo(role, readFileSync(file));
      log.info('logo added', { role, mime: added.mime, bytes: added.bytes });
      // The club's next events on this laptop get it too (#111).
      if (role === 'club') rememberClubLogo(store);
      return logoViews(store);
    });
  },

  removeLogo(id: string): Outcome<LogoView[]> {
    return attempt('removing the logo', () => {
      const store = openStore();
      if (typeof id === 'string') store.removeLogo(id);
      return logoViews(store);
    });
  },

  liveScores(): Outcome<LiveScores | null> {
    const store = library?.current;
    if (!store) return { ok: true, value: null };
    return attempt('working out live scores', () => liveScores(store));
  },

  listSeries(): Outcome<SeriesSummary[]> {
    return attempt('listing series', () => seriesSummaries(eventsDir()));
  },

  newSeries(name: string): Outcome<SeriesView> {
    return attempt('making the series', () => {
      const file = newSeries(eventsDir(), typeof name === 'string' ? name : '');
      return seriesView(eventsDir(), file);
    });
  },

  seriesView(file: string): Outcome<SeriesView> {
    return attempt('working out series points', () => seriesView(eventsDir(), String(file)));
  },

  updateSeries(file: string, change: SeriesChange): Outcome<SeriesView> {
    return attempt('saving the series', () => {
      if (change?.addRound !== undefined && !events().isRecent(change.addRound)) {
        throw new StoreError('APP_NOT_RECENT', "That event isn't in the recent list.", {
          key: 'errors.APP_NOT_RECENT',
        });
      }
      if (change?.rules) checkRules(change.rules);
      updateSeries(eventsDir(), String(file), {
        ...(typeof change?.name === 'string' && { name: change.name }),
        ...(change?.rules && { rules: change.rules }),
        ...(typeof change?.addRound === 'string' && { addRound: change.addRound }),
        ...(typeof change?.removeRound === 'string' && { removeRound: change.removeRound }),
      });
      return seriesView(eventsDir(), String(file));
    });
  },

  async addSeriesRoundFile(
    file: string,
    win: BrowserWindow | null,
  ): Promise<Outcome<SeriesView | null>> {
    const options: Electron.OpenDialogOptions = {
      title: t('dialog.addRound'),
      defaultPath: eventsDir(),
      properties: ['openFile'],
      filters: [{ name: t('dialog.tscoreEvent'), extensions: ['sqlite'] }],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    const chosen = picked.filePaths[0];
    if (picked.canceled || !chosen) return { ok: true, value: null };
    return attempt('adding the round', () => {
      updateSeries(eventsDir(), String(file), { addRound: dirname(chosen) });
      return seriesView(eventsDir(), String(file));
    });
  },

  deleteSeries(file: string): Outcome<SeriesSummary[]> {
    return attempt('deleting the series', () => {
      removeSeries(eventsDir(), String(file));
      return seriesSummaries(eventsDir());
    });
  },

  exportSeries(
    file: string,
    kind: ExportKind,
    juniorInitials: boolean,
    win: BrowserWindow | null,
  ): Promise<Outcome<string | null>> {
    return attemptAsync('saving series points', () => {
      if (kind !== 'pdf' && kind !== 'csv')
        throw new StoreError('APP_BAD_REQUEST', 'Choose PDF or CSV.', {
          key: 'errors.APP_BAD_REQUEST_22',
        });
      return exportSeries(eventsDir(), String(file), kind, juniorInitials === true, win);
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

  course(day?: number): Outcome<CourseView> {
    return attempt('working out who is on course', () => {
      if (day !== undefined && !isWhole(day)) {
        throw new StoreError('APP_BAD_REQUEST', 'Choose a day.', {
          key: 'errors.APP_BAD_REQUEST_23',
        });
      }
      return courseView(openStore(), day);
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

  markFinal(): Outcome<ResultsView> {
    return attempt('marking results final', () => {
      const store = openStore();
      markFinal(store);
      log.info('results marked final', {
        eventId: store.eventId,
        revision: store.finalState()?.revision,
      });
      return resultsView(store);
    });
  },

  reopenResults(reason: string): Outcome<ResultsView> {
    return attempt('reopening results', () => {
      const store = openStore();
      if (typeof reason !== 'string') {
        throw new StoreError('APP_BAD_REQUEST', 'Say why the results are being reopened.', {
          key: 'errors.APP_BAD_REQUEST_24',
        });
      }
      store.reopenResults(reason);
      log.info('results reopened', {
        eventId: store.eventId,
        revision: store.finalState()?.revision,
      });
      return resultsView(store);
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
        throw new StoreError('APP_NO_ENTRY_LIST', 'Choose the entry list again.', {
          key: 'errors.APP_NO_ENTRY_LIST',
        });
      }
      // Worked out again here from the event as saved, not taken from the window.
      const plan = planImport(pending.list, store.setup, store.entries(), choices ?? {});
      if (!plan.ready) {
        throw new StoreError(
          'APP_IMPORT_NOT_READY',
          'Some class names or double entries still need a decision.',
          { key: 'errors.APP_IMPORT_NOT_READY' },
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
