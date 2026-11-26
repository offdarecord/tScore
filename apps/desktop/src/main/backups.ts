/**
 * Automatic backups of the open event (ADR 0005).
 *
 * Every change to an event is audited, so the audit log's latest number says whether anything
 * changed. After a change, a backup is made at most every five minutes, and always as the event
 * closes. Each backup goes in the event's own `backups\` folder (the newest 20 automatic ones
 * kept; named ones never pruned), and is copied to a second place if the desk chose one: a USB
 * stick or another drive, so a dead laptop doesn't take the event with it.
 *
 * The second place belongs to this laptop, not the event, so it lives in the app's settings.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import type { EventStore } from '@tscore/store';
import { app } from 'electron';
import log from 'electron-log/main';
import { t } from './i18n';
import type { BackupStatus } from '../shared/ipc';

const EVERY_MS = 5 * 60_000;
const CHECK_MS = 60_000;
const KEEP = 20;

interface Seen {
  folder: string;
  mark: number;
  at: number;
}

let seen: Seen | null = null;
let last: { at: string; file: string; secondCopy: boolean; problem?: string } | null = null;

const settingsFile = () => join(app.getPath('userData'), 'backup.json');

/** The second place for backups on this laptop, if one is chosen. */
export function secondPlace(): string | null {
  try {
    const data = JSON.parse(readFileSync(settingsFile(), 'utf8')) as { folder?: unknown };
    return typeof data.folder === 'string' && data.folder ? data.folder : null;
  } catch {
    return null;
  }
}

export function setSecondPlace(folder: string | null): void {
  writeFileSync(settingsFile(), JSON.stringify(folder ? { folder } : {}), 'utf8');
}

/** Copy a backup to the second place, keeping the newest automatic ones there too. */
function copyToSecondPlace(store: EventStore, file: string): string | undefined {
  const place = secondPlace();
  if (!place) return undefined;
  if (!existsSync(place)) {
    return t('errors.BACKUP_PLACE_MISSING', { place });
  }
  try {
    const dir = join(place, 'tScore backups', basename(store.folder));
    mkdirSync(dir, { recursive: true });
    copyFileSync(file, join(dir, basename(file)));
    const autos = readdirSync(dir)
      .filter((f) => f.endsWith('-auto.sqlite'))
      .sort();
    for (const old of autos.slice(0, Math.max(0, autos.length - KEEP))) rmSync(join(dir, old));
    return undefined;
  } catch (err) {
    return t('errors.BACKUP_COPY_FAILED', { place, problem: (err as Error).message });
  }
}

/** Back up now. `label` "auto" is pruned to the newest 20; any other label is kept. */
export function backUp(store: EventStore, label = 'auto'): string {
  const file = store.backup(label, KEEP);
  const problem = copyToSecondPlace(store, file);
  last = {
    at: new Date().toISOString(),
    file,
    secondCopy: secondPlace() !== null && problem === undefined,
    ...(problem !== undefined && { problem }),
  };
  seen = { folder: store.folder, mark: store.changeMark(), at: Date.now() };
  if (problem) log.warn('backup made, but not copied to the second place', { label });
  else log.info('backup made', { label, secondCopy: last.secondCopy });
  return file;
}

/** Back up if anything changed since the last backup (or since the event was opened). */
function backUpIfChanged(store: EventStore, force: boolean): void {
  const mark = store.changeMark();
  if (!seen || seen.folder !== store.folder) {
    // Just opened: nothing to back up until something changes.
    seen = { folder: store.folder, mark, at: Date.now() };
    return;
  }
  if (mark === seen.mark) return;
  if (!force && Date.now() - seen.at < EVERY_MS) return;
  backUp(store);
}

/** Run before an event closes: back it up if it changed. Never stops it closing. */
export function beforeClose(store: EventStore): void {
  try {
    backUpIfChanged(store, true);
  } catch (err) {
    log.error('backup on close failed', err);
  }
  seen = null;
}

/** Check every minute whether the open event needs a backup. */
export function startBackups(current: () => EventStore | null): void {
  setInterval(() => {
    const store = current();
    if (!store) return;
    try {
      backUpIfChanged(store, false);
    } catch (err) {
      log.error('automatic backup failed', err);
    }
  }, CHECK_MS);
}

export function backupStatus(store: EventStore): BackupStatus {
  const place = secondPlace();
  const backups = existsSync(join(store.folder, 'backups'))
    ? readdirSync(join(store.folder, 'backups')).filter((f) => f.endsWith('.sqlite')).length
    : 0;
  return {
    folder: store.folder,
    backups,
    ...(last && last.file.startsWith(store.folder) && { lastAt: last.at }),
    ...(place && { secondPlace: place, secondPlaceAvailable: existsSync(place) }),
    ...(last?.problem && last.file.startsWith(store.folder) && { problem: last.problem }),
  };
}
