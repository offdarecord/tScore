/**
 * The diagnostic log (ADR 0012): `%APPDATA%\tScore\logs\main.log`.
 *
 * electron-log tests the log file once, on the first message. If that one write fails, even
 * briefly (another program has the file open as tScore starts), it silently drops every
 * message for the rest of the session. That hid real problems (24 Nov 2026). So tScore tests
 * the file itself first, retries for a moment, and if it still can't write, logs to a file of
 * its own for this session and records why.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import log from 'electron-log/main';

const ATTEMPTS = 10;
const WAIT_MS = 100;

/** Wait without an event loop (this runs before the app is ready). */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writable(path: string): NodeJS.ErrnoException | null {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, '');
    return null;
  } catch (err) {
    return err as NodeJS.ErrnoException;
  }
}

export interface LogStart {
  /** The file this session logs to. */
  readonly path: string;
  /** Why the usual file couldn't be used, if it couldn't. */
  readonly problem?: string;
}

/** Set up the log so this session's messages reach a file. Call before anything logs. */
export function startLogging(): LogStart {
  log.initialize();
  const file = log.transports.file;
  // Where electron-log will write (the app's data folder), before it runs its own one-off test.
  const usual = join(app.getPath('userData'), 'logs', file.fileName);

  let problem: NodeJS.ErrnoException | null = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    problem = writable(usual);
    if (!problem) break;
    pause(WAIT_MS);
  }
  // Now electron-log tests it. A file that fails its test is dropped for good, so check.
  const dropped = (f: object) => 'isNull' in f && typeof f.isNull === 'function' && f.isNull();
  const chosen = file.getFile();
  if (!problem && !dropped(chosen)) return { path: chosen.path };

  const own = join(dirname(chosen.path), `main-${process.pid}.log`);
  file.resolvePathFn = () => own;
  return {
    path: file.getFile().path,
    problem: problem ? `${problem.code ?? 'error'}: ${problem.message}` : 'file dropped',
  };
}
