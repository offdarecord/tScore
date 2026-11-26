/**
 * The diagnostic log (ADR 0012): `logs\main.log` in the app's data folder (`%APPDATA%\tScore` on
 * Windows, `~/Library/Application Support/tScore` on macOS).
 *
 * electron-log tests the log file once, on the first message. If that one write fails, even
 * briefly (another program has the file open as tScore starts), it silently drops every
 * message for the rest of the session. That hid real problems (24 Nov 2026). So tScore tests
 * the file itself first, retries for a moment, and if it still can't write, logs to a file of
 * its own for this session and records why.
 *
 * On 27 Nov 2026 runs straight after an install still left nothing in the log, and no file of
 * their own (#138). So every start also writes its own line straight to the file, without
 * electron-log, and then checks that electron-log's first message really arrived.
 */
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main';

const ATTEMPTS = 10;
const WAIT_MS = 100;

/** Wait without an event loop (this runs before the app is ready). */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const describe = (err: unknown) => {
  const e = err as NodeJS.ErrnoException;
  return `${e.code ?? 'error'}: ${e.message}`;
};

function writable(path: string): NodeJS.ErrnoException | null {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, '');
    return null;
  } catch (err) {
    return err as NodeJS.ErrnoException;
  }
}

/** Local time, in electron-log's format, so the start line sorts with the rest. */
function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  );
}

/** Append a line without electron-log. Returns why it couldn't, or null. */
function appendLine(path: string, text: string): string | null {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `[${stamp(new Date())}] [start] ${text}\n`);
    return null;
  } catch (err) {
    return describe(err);
  }
}

/** Whether `text` was written to `path` after it was `from` bytes long. */
function arrived(path: string, from: number, text: string): boolean {
  try {
    const all = readFileSync(path);
    // A file smaller than before was rotated by electron-log: look at all of it.
    return all.subarray(all.length >= from ? from : 0).includes(text);
  } catch {
    return false;
  }
}

const sizeOf = (path: string) => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

export interface LogStart {
  /** The file this session logs to. */
  readonly path: string;
  /** Why the usual file couldn't be used, if it couldn't. */
  readonly problem?: string;
}

/**
 * Set up the log so this session's messages reach a file, and log that tScore is starting.
 * Call before anything else logs.
 */
export function startLogging(): LogStart {
  log.initialize();
  const file = log.transports.file;
  // The app's data folder on every system. electron-log's own default matches it on Windows,
  // but on macOS it's ~/Library/Logs, so set it before electron-log runs its one-off test.
  const usual = join(app.getPath('userData'), 'logs', file.fileName);
  const own = join(dirname(usual), `main-${process.pid}.log`);
  file.resolvePathFn = () => usual;

  // Who started this copy, and how, for runs that end without a trace otherwise.
  const startLine = (path: string) =>
    `tScore ${app.getVersion()} starting (pid ${process.pid}, parent ${process.ppid}, ` +
    `${process.platform} ${process.arch}, args ${JSON.stringify(process.argv.slice(1))}), ` +
    `logging to ${path}`;

  let problem: string | null = null;
  let failure: NodeJS.ErrnoException | null = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    failure = writable(usual);
    if (!failure) break;
    pause(WAIT_MS);
  }
  // Now electron-log tests it. A file that fails its test is dropped for good, so check.
  const dropped = (f: object) => 'isNull' in f && typeof f.isNull === 'function' && f.isNull();
  if (failure) problem = describe(failure);
  else if (dropped(file.getFile())) problem = 'file dropped';
  else {
    const direct = appendLine(usual, startLine(usual));
    if (direct) problem = `start line not written: ${direct}`;
  }

  if (!problem) {
    // The first message through electron-log, marked so it can be found again.
    const run = `${process.pid}-${Date.now()}`;
    const before = sizeOf(usual);
    // Automated tests can lose this one message, to try the fallback (development builds only).
    const level = file.level;
    if (process.env['TSCORE_TEST_LOSE_FIRST_LOG'] && !app.isPackaged) file.level = false;
    log.info('tScore starting', { version: app.getVersion(), run });
    file.level = level;
    if (arrived(usual, before, run)) return { path: usual };
    problem = "electron-log's first message didn't reach the file";
    // Leave a pointer where support will look first, if the file takes it.
    appendLine(usual, `this session (pid ${process.pid}) logs to ${own}: ${problem}`);
  }

  file.resolvePathFn = () => own;
  appendLine(own, startLine(own));
  log.info('tScore starting', { version: app.getVersion() });
  return { path: file.getFile().path, problem };
}

/** The log folder, for About → Show log folder. */
export function logFolder(): string {
  return dirname(log.transports.file.getFile().path);
}
