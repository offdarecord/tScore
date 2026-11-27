/**
 * Updating tScore from GitHub Releases (ADR 0011), shown on Home and in About (#137).
 *
 * An installed copy checks as it starts, every few hours while it's open, and when the desk
 * presses Check for updates. A new version downloads in the background and installs when
 * tScore closes; tScore never restarts itself. Nothing is checked or downloaded while an event
 * is open: a download stops if one opens, and starts again at the next check. Offline is
 * normal at venues, so failures are logged quietly.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main';
import electronUpdater from 'electron-updater';
import type { UpdateState, UpdateStatus } from '../shared/ipc';
import { isEventOpen } from './events';

/** What tScore needs from electron-updater, so automated tests can stand in for it. */
interface Updater {
  /** The newer version on offer, or null if this is the latest. Throws if it can't check. */
  check(): Promise<string | null>;
  /** Download it, reporting progress (0–100). Throws if stopped or it fails. */
  download(progress: (percent: number) => void): Promise<void>;
  /** Stop a download in progress. */
  stop(): void;
}

const EVERY_MS = 4 * 60 * 60 * 1000;

function realUpdater(): Updater {
  const { autoUpdater, CancellationToken } = electronUpdater;
  autoUpdater.logger = log;
  // tScore decides when to download (never during an event), and installs only on close.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  let token: InstanceType<typeof CancellationToken> | null = null;
  return {
    async check() {
      const r = await autoUpdater.checkForUpdates();
      return r?.isUpdateAvailable ? r.updateInfo.version : null;
    },
    async download(progress) {
      const report = (p: { percent: number }) => progress(p.percent);
      autoUpdater.on('download-progress', report);
      token = new CancellationToken();
      try {
        await autoUpdater.downloadUpdate(token);
      } finally {
        autoUpdater.off('download-progress', report);
        token = null;
      }
    },
    stop() {
      token?.cancel();
    },
  };
}

/**
 * Stands in for electron-updater in automated tests (`TSCORE_TEST_UPDATER`, development builds
 * only): `latest`, `offline`, `update` (9.9.9 downloads at once) or `downloading` (stays at 40%).
 */
function testUpdater(scenario: string): Updater {
  let stopped: (() => void) | null = null;
  return {
    check() {
      if (scenario === 'offline')
        return Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED'));
      return Promise.resolve(scenario === 'latest' ? null : '9.9.9');
    },
    download(progress) {
      return new Promise((resolve, reject) => {
        stopped = () => reject(new Error('cancelled'));
        progress(40);
        if (scenario === 'update') {
          setTimeout(() => {
            progress(100);
            resolve();
          }, 300);
        }
      });
    },
    stop() {
      stopped?.();
    },
  };
}

interface Saved {
  lastChecked?: string;
  /** The version that ran last, to notice an update has installed. */
  lastVersion?: string;
}

let updater: Updater | null = null;
let state: UpdateState = { kind: 'off' };
let saved: Saved = {};
let updatedFrom: string | null = null;
let notify: (status: UpdateStatus) => void = () => {};

const savedFile = () => join(app.getPath('userData'), 'updates.json');

function save(): void {
  try {
    writeFileSync(savedFile(), JSON.stringify(saved));
  } catch (err) {
    log.warn('update: could not save updates.json', err);
  }
}

export function updateStatus(): UpdateStatus {
  return { state, lastChecked: saved.lastChecked ?? null, updatedFrom };
}

function set(next: UpdateState): void {
  state = next;
  notify(updateStatus());
}

/** Set up updating for this session, and check if it's safe to. Call once the app is ready. */
export function startUpdates(onChange: (status: UpdateStatus) => void): void {
  notify = onChange;
  const scenario = process.env['TSCORE_TEST_UPDATER'];
  const test = scenario && !app.isPackaged ? scenario : null;
  if (test === 'mac' || (!test && process.platform === 'darwin')) {
    // The Mac beta isn't signed, and macOS won't install an unsigned update: Mac users download
    // each new version by hand until it is (#61).
    state = { kind: 'byHand' };
    log.info('update: the Mac beta updates by hand');
    return;
  }
  if (!test && !app.isPackaged) return;

  updater = test ? testUpdater(test) : realUpdater();
  state = { kind: 'idle' };
  try {
    saved = JSON.parse(readFileSync(savedFile(), 'utf8')) as Saved;
  } catch {
    saved = {};
  }
  const version = app.getVersion();
  if (saved.lastVersion && saved.lastVersion !== version) {
    updatedFrom = saved.lastVersion;
    log.info('update: installed', { from: updatedFrom, to: version });
  }
  saved.lastVersion = version;
  save();

  app.on('before-quit', () => {
    if (state.kind === 'ready') log.info('update: installing on close', { version: state.version });
  });
  void checkForUpdates();
  setInterval(() => void checkForUpdates(), EVERY_MS).unref();
}

/** Check now, then download any new version. Resolves once the check is done. */
export async function checkForUpdates(): Promise<UpdateStatus> {
  const u = updater;
  if (!u) return updateStatus();
  // Already on its way, or waiting to install on close.
  if (state.kind === 'checking' || state.kind === 'downloading' || state.kind === 'ready') {
    return updateStatus();
  }
  if (isEventOpen()) {
    log.info('update: check skipped, event open');
    // Only the answer to this check: once the event closes, the last state stands again.
    return { ...updateStatus(), state: { kind: 'eventOpen' } };
  }

  log.info('update: checking');
  set({ kind: 'checking' });
  let version: string | null;
  try {
    version = await u.check();
  } catch (err) {
    log.warn('update: check failed (offline is normal)', err);
    set({ kind: 'offline' });
    return updateStatus();
  }
  saved.lastChecked = new Date().toISOString();
  save();

  if (!version) {
    log.info('update: tScore is the latest version');
    set({ kind: 'latest' });
  } else if (isEventOpen()) {
    log.info('update: available, waits until the event is closed', { version });
    set({ kind: 'idle' });
  } else {
    log.info('update: available', { version });
    download(u, version);
  }
  return updateStatus();
}

function download(u: Updater, version: string): void {
  log.info('update: downloading', { version });
  set({ kind: 'downloading', version, percent: 0 });
  u.download((percent) => {
    if (isEventOpen()) {
      u.stop();
      return;
    }
    const whole = Math.floor(percent);
    if (state.kind === 'downloading' && whole !== state.percent) {
      set({ kind: 'downloading', version, percent: whole });
    }
  }).then(
    () => {
      log.info('update: downloaded, installs when tScore closes', { version });
      set({ kind: 'ready', version });
    },
    (err: unknown) => {
      if (isEventOpen()) {
        log.info('update: download stopped, event opened', { version });
        set({ kind: 'idle' });
      } else {
        log.warn('update: download failed', err);
        set({ kind: 'offline' });
      }
    },
  );
}
