/**
 * The typed bridge between the renderer and the main process.
 *
 * Every channel is listed here; the preload exposes only these, and the main process
 * validates the sender of every message. Add a channel here first, then implement it.
 */
import type { EventSetup, ValidationIssue } from '@tscore/core';

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
} as const;

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
}
