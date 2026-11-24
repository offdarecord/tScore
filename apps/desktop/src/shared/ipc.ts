/**
 * The typed bridge between the renderer and the main process.
 *
 * Every channel is listed here; the preload exposes only these, and the main process
 * validates the sender of every message. Add a channel here first, then implement it.
 */
import type {
  EntryList,
  EntryStatus,
  EventSetup,
  ImportChoices,
  LabelLayout,
  LabelLayoutChoice,
  LabelSkip,
  Results,
  CompetitionStatus,
  ValidationIssue,
} from '@tscore/core';

export const IPC = {
  appInfo: 'app:info',
  recentEvents: 'events:recent',
  createEvent: 'events:create',
  openEventFile: 'events:open-file',
  openRecentEvent: 'events:open-recent',
  forgetEvent: 'events:forget',
  currentEvent: 'event:current',
  updateSetup: 'event:update-setup',
  closeEvent: 'event:close',
  riders: 'event:riders',
  updateRider: 'event:update-rider',
  addLateEntry: 'event:add-late-entry',
  chooseEntryList: 'import:choose-file',
  importRiders: 'import:riders',
  cardDesk: 'cards:desk',
  saveCard: 'cards:save',
  addPenalty: 'penalties:add',
  removePenalty: 'penalties:remove',
  results: 'results:view',
  exportResults: 'results:export',
  openExport: 'results:open-export',
  backupStatus: 'backup:status',
  backupNow: 'backup:now',
  chooseBackupPlace: 'backup:choose-place',
  clearBackupPlace: 'backup:clear-place',
  restoreFromBackup: 'backup:restore',
  preEventCheck: 'check:pre-event',
  labels: 'labels:view',
  saveLabels: 'labels:save',
  saveLabelTestPage: 'labels:save-test-page',
  setLabelOffset: 'labels:set-offset',
  course: 'course:view',
} as const;

/** One lap on the Progress grid. */
export type CourseLap =
  | { readonly kind: 'in'; readonly total: number | null }
  | { readonly kind: 'due' | 'overdue' | 'dnf' | 'dns' | 'not_ridden' };

/** Progress and Still on course for one day, at the laptop's time. */
export interface CourseView {
  readonly day: number;
  readonly days: readonly number[];
  /** The day's lap 1 start (HH:MM), if set. */
  readonly startTime?: string;
  /** The start has passed (or there's no start time). */
  readonly started: boolean;
  /** When this was worked out (ISO). */
  readonly now: string;
  readonly marginMinutes: number;
  readonly mostLaps: number;
  readonly counts: {
    readonly cardsIn: number;
    readonly cardsExpected: number;
    readonly out: number;
    readonly waiting: number;
    readonly in: number;
    readonly overdue: number;
    readonly dnf: number;
    readonly dns: number;
  };
  /** Average lap per class, in minutes. */
  readonly averageLap: Readonly<Record<string, number>>;
  readonly riders: readonly {
    readonly number: number;
    readonly name: string;
    readonly className: string;
    readonly state: 'waiting' | 'out' | 'in' | 'dnf' | 'dns' | 'not_riding';
    readonly laps: number;
    readonly total: number;
    readonly lapStates: readonly CourseLap[];
    readonly lastCard?: { readonly lap: number; readonly at: string };
    readonly minutesOut?: number;
    readonly overdue?: {
      readonly lap: number;
      readonly minutes: number;
      readonly averageLap: number;
    };
    /** Cards the last hand-in brought, when more than one. */
    readonly carrying?: number;
  }[];
}

/** Which card labels to print. */
export interface LabelRequest {
  readonly layout: LabelLayoutChoice;
  /** First position on the first sheet, from 1. */
  readonly start: number;
  readonly qr: boolean;
  /** Everyone, only labels not printed yet (late entries, added laps), or one rider. */
  readonly which: 'all' | 'unprinted' | { readonly rider: number };
}

/** Printer alignment for this laptop, in mm: + moves right / down. */
export interface LabelOffset {
  readonly x: number;
  readonly y: number;
}

/** One label as the preview draws it. */
export interface LabelPreview {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  readonly lapText: string;
  readonly name: string;
  /** The name had to go down a size to fit. */
  readonly small: boolean;
  readonly classText: string;
  /** QR modules, a string of 0s and 1s per row (empty without QR codes). */
  readonly qr: readonly string[];
}

export interface LabelsView {
  readonly template: {
    readonly id: string;
    readonly name: string;
    readonly columns: number;
    readonly perSheet: number;
  };
  /** The layout used (auto resolved). */
  readonly layout: LabelLayout;
  readonly labels: number;
  readonly riders: number;
  readonly sheets: number;
  /** The first sheet's positions; null is left blank. */
  readonly firstSheet: readonly (LabelPreview | null)[];
  /** Riders who get no labels, and why. */
  readonly skipped: readonly (LabelSkip & { readonly name: string })[];
  /** Labels printed at least once, and labels the event needs that haven't been. */
  readonly printed: number;
  readonly notPrinted: number;
  readonly days: number;
  readonly offset: LabelOffset;
}

export type { LabelLayoutChoice };

/** One line of the pre-event check. */
export interface CheckItem {
  readonly id: 'setup' | 'riders' | 'labels' | 'clock' | 'backups';
  readonly state: 'ok' | 'warning' | 'problem' | 'info';
  readonly title: string;
  readonly detail: string;
  /** The screen that fixes it. */
  readonly fix?: 'setup' | 'riders' | 'labels' | 'backup';
  /** For the clock: the laptop's time when checked (ISO). */
  readonly clock?: string;
}

export interface PreEventCheck {
  readonly items: readonly CheckItem[];
  readonly summary: string;
  /** Nothing must be fixed first (warnings are allowed). */
  readonly ready: boolean;
}

/** Backups of the open event, and the second place they're copied to (this laptop). */
export interface BackupStatus {
  /** Where the event is saved. */
  readonly folder: string;
  /** Backups in the event's backups folder. */
  readonly backups: number;
  /** The last backup this session made. */
  readonly lastAt?: string;
  /** A USB stick or another drive each backup is also copied to. */
  readonly secondPlace?: string;
  readonly secondPlaceAvailable?: boolean;
  /** The last backup couldn't be copied there. */
  readonly problem?: string;
}

export type ExportKind = 'pdf' | 'csv';

/** Something stopping results being final (a card not in yet, or a score not decided). */
export interface ResultsGapInfo {
  readonly kind: 'missing_card' | 'undecided_score';
  readonly number: number;
  readonly className: string;
  readonly day: number;
  readonly lap: number;
  readonly section?: number;
}

/** Results as the Results screen shows them: full names (this laptop only). */
export interface ResultsView {
  readonly results: Results;
  readonly gaps: readonly ResultsGapInfo[];
  /** Classes whose surnames become an initial in anything saved to share, if the desk chooses. */
  readonly juniorClasses: readonly string[];
}

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly electron: string;
  readonly platform: string;
  readonly arch: string;
  /** Where new events are saved. */
  readonly eventsDir: string;
}

/** An event in the recent list. */
export interface RecentEventInfo {
  readonly folder: string;
  readonly name: string;
  readonly code: string;
  readonly date?: string;
  readonly days: number;
  readonly lastOpened: string;
  /** The folder has gone (moved, deleted, or on a USB stick that isn't plugged in). */
  readonly missing: boolean;
}

/** The open event, as the screens need it. */
export interface OpenEvent {
  readonly folder: string;
  readonly setup: EventSetup;
  /** Riders entered in each class (a rider in two classes counts in both). */
  readonly ridersByClass: Readonly<Record<string, number>>;
  readonly riders: number;
  readonly cards: number;
}

/** A rider (or sidecar crew), as the screens show them. Licence numbers stay in the main process. */
export interface RiderInfo {
  readonly number: number;
  readonly riders: readonly { readonly givenName: string; readonly familyName: string }[];
  readonly club?: string;
  /** Make and model, e.g. "Beta Evo 300". For the desk only, never published. */
  readonly machine?: string;
  readonly competitionStatus: CompetitionStatus;
  readonly status: EntryStatus;
  /** One class, or two for a second-class entry. */
  readonly classes: readonly string[];
  /** Some of this rider's card labels have been saved for printing. */
  readonly labelsPrinted?: boolean;
}

export interface RiderChange {
  /** One name per rider on the entry (driver then passenger for a sidecar), in order. */
  readonly riders?: readonly { readonly givenName: string; readonly familyName: string }[];
  /** null or "" clears it. */
  readonly club?: string | null;
  /** null or "" clears it. */
  readonly machine?: string | null;
  readonly classes?: readonly string[];
  readonly competitionStatus?: CompetitionStatus;
  readonly status?: EntryStatus;
}

/** A rider entered on the day (late entry). */
export interface NewRider {
  /** Leave out for the next free number. */
  readonly number?: number;
  /** One rider, or driver then passenger for a sidecar. */
  readonly riders: readonly { readonly givenName: string; readonly familyName: string }[];
  readonly club?: string;
  readonly machine?: string;
  readonly className: string;
  readonly competitionStatus: CompetitionStatus;
}

/**
 * An entry list the desk picked, reduced to the columns its preset reads (no dates of birth,
 * contact or medical details: those never leave the main process).
 */
export interface EntryListFile {
  readonly fileName: string;
  readonly list: EntryList;
}

/** A rider as Manual entry needs them: who, and how many sections and laps they ride each day. */
export interface DeskRider extends RiderInfo {
  /** By day number. Their first class decides (a second class shares the same cards). */
  readonly rides: Readonly<Record<number, { readonly sections: number; readonly laps: number }>>;
}

export type CardSource = 'scan' | 'review' | 'manual' | 'amend' | 'import';

export interface CardRow {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  readonly scores: readonly (number | null)[];
  /** ISO 8601. */
  readonly receivedAt: string;
  /** How it was first entered. */
  readonly source: CardSource;
  readonly edited: boolean;
}

export type PenaltyReason = 'time' | 'dissent' | 'outside_assistance' | 'course_cutting' | 'other';

export interface PenaltyRow {
  readonly id: string;
  readonly number: number;
  readonly points: number;
  readonly reason: PenaltyReason;
  readonly note?: string;
  readonly day?: number;
  readonly lap?: number;
  readonly createdAt: string;
}

/** Everything the Manual entry screen shows. */
export interface CardDesk {
  readonly riders: readonly DeskRider[];
  /** Newest first. */
  readonly cards: readonly CardRow[];
  readonly penalties: readonly PenaltyRow[];
  readonly scoreValues: readonly number[];
  /** Rows on the event's scorecard (16 on the regional card). */
  readonly cardRows: number;
  readonly days: readonly { readonly day: number; readonly date?: string }[];
}

export interface SaveCard {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  readonly scores: readonly number[];
  /** ISO 8601. Ignored when editing (the card keeps its time). */
  readonly receivedAt: string;
  /** Replace the scores of a card that's already in. */
  readonly editing: boolean;
}

export interface NewPenalty {
  readonly number: number;
  readonly points: number;
  readonly reason: PenaltyReason;
  readonly note?: string;
  readonly day?: number;
  readonly lap?: number;
}

/** A problem to show the desk, in plain words, with a stable code for support. */
export interface AppError {
  readonly code: string;
  readonly message: string;
  /** For an invalid setup: every problem, with where it is. */
  readonly issues?: readonly ValidationIssue[];
}

/** Results of calls that can fail in ways the desk should see (not exceptions). */
export type Outcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError };

export interface TscoreApi {
  getAppInfo(): Promise<AppInfo>;
  recentEvents(): Promise<RecentEventInfo[]>;
  createEvent(setup: EventSetup): Promise<Outcome<OpenEvent>>;
  /** Shows the open dialog. `null` if the desk cancels. */
  openEventFile(): Promise<Outcome<OpenEvent | null>>;
  openRecentEvent(folder: string): Promise<Outcome<OpenEvent>>;
  forgetEvent(folder: string): Promise<void>;
  /** The open event, if any (e.g. after the window reloads). */
  currentEvent(): Promise<OpenEvent | null>;
  updateSetup(setup: EventSetup): Promise<Outcome<OpenEvent>>;
  closeEvent(): Promise<void>;
  riders(): Promise<RiderInfo[]>;
  updateRider(number: number, change: RiderChange): Promise<Outcome<RiderInfo[]>>;
  /** Add a rider on the day. Returns the number given and the updated list. */
  addLateEntry(
    rider: NewRider,
  ): Promise<Outcome<{ readonly number: number; readonly riders: RiderInfo[] }>>;
  /** Shows the open dialog and reads the file. `null` if the desk cancels. */
  chooseEntryList(): Promise<Outcome<EntryListFile | null>>;
  /** Import the chosen list's riders, with the desk's choices. */
  importRiders(choices: ImportChoices): Promise<Outcome<OpenEvent>>;
  cardDesk(): Promise<Outcome<CardDesk>>;
  /** Save a typed card, or an edit of one. Checked again in the main process. */
  saveCard(card: SaveCard): Promise<Outcome<CardDesk>>;
  addPenalty(penalty: NewPenalty): Promise<Outcome<CardDesk>>;
  removePenalty(id: string): Promise<Outcome<CardDesk>>;
  results(): Promise<Outcome<ResultsView>>;
  /** Shows the save dialog, then saves. The saved path, or `null` if the desk cancels. */
  exportResults(kind: ExportKind, juniorInitials: boolean): Promise<Outcome<string | null>>;
  /** Open the file just saved. */
  openExport(): Promise<Outcome<null>>;
  backupStatus(): Promise<Outcome<BackupStatus>>;
  /** Make a backup now (kept, never pruned). */
  backupNow(): Promise<Outcome<BackupStatus>>;
  /** Shows a folder dialog for the second place. `null` if the desk cancels. */
  chooseBackupPlace(): Promise<Outcome<BackupStatus | null>>;
  clearBackupPlace(): Promise<Outcome<BackupStatus>>;
  /** Shows the open dialog, then opens the backup as a new event folder. `null` if cancelled. */
  /** Check the event is ready for the first card. */
  preEventCheck(): Promise<Outcome<PreEventCheck>>;
  restoreFromBackup(): Promise<
    Outcome<{ readonly event: OpenEvent; readonly from: string } | null>
  >;
  labels(request: LabelRequest): Promise<Outcome<LabelsView>>;
  /** Shows the save dialog, then saves the Word document. `null` if the desk cancels. */
  saveLabels(
    request: LabelRequest,
  ): Promise<Outcome<{ readonly path: string; readonly labels: number } | null>>;
  /** Shows the save dialog, then saves the plain-paper alignment test page. */
  saveLabelTestPage(): Promise<Outcome<string | null>>;
  setLabelOffset(offset: LabelOffset): Promise<Outcome<LabelOffset>>;
  /** Progress and Still on course for a day (default: today's day, else day 1). */
  course(day?: number): Promise<Outcome<CourseView>>;
}
