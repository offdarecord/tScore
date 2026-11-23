/**
 * Opening an event's SQLite file safely (ADRs 0005 and 0006).
 *
 * - WAL journal with `synchronous=FULL`: a committed transaction survives a power cut.
 * - `quick_check` on open: a damaged file is refused rather than half-read.
 * - Migrations: an older file is backed up, then migrated forward in one transaction. A file
 *   from a newer tScore is refused.
 */
import { DatabaseSync } from 'node:sqlite';
import { DamagedFileError, NewerFileError } from './errors.js';
import { MIGRATIONS, SCHEMA_VERSION } from './migrations.js';

export interface OpenOptions {
  /** Create the file if it doesn't exist (new event). */
  readonly create: boolean;
  /** Called with a path for a copy of the file before it's migrated. Must not exist yet. */
  readonly backupPathBeforeMigration: (fromVersion: number) => string;
}

export function openDatabase(path: string, options: OpenOptions): DatabaseSync {
  const db = new DatabaseSync(path, {
    open: true,
    readOnly: false,
    enableForeignKeyConstraints: true,
  });
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = FULL');
    db.exec('PRAGMA busy_timeout = 5000');

    const check = db.prepare('PRAGMA quick_check').all() as { quick_check: string }[];
    const problems = check.map((r) => r.quick_check).filter((r) => r !== 'ok');
    if (problems.length > 0) throw new DamagedFileError(problems.slice(0, 3).join('; '));

    const version = userVersion(db);
    if (version > SCHEMA_VERSION) throw new NewerFileError(version, SCHEMA_VERSION);
    if (version === 0 && !options.create && !hasTables(db)) {
      throw new DamagedFileError('no tScore tables');
    }
    if (version > 0 && version < SCHEMA_VERSION) {
      backupTo(db, options.backupPathBeforeMigration(version));
    }
    migrate(db, version);
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

export function userVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

function hasTables(db: DatabaseSync): boolean {
  const row = db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type = 'table'").get() as {
    n: number;
  };
  return row.n > 0;
}

/** Apply every migration after `from`, all in one transaction. */
function migrate(db: DatabaseSync, from: number): void {
  if (from >= SCHEMA_VERSION) return;
  transaction(db, () => {
    for (let v = from; v < SCHEMA_VERSION; v++) db.exec(MIGRATIONS[v] ?? '');
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

/**
 * A consistent copy of the open database at `path`, made with `VACUUM INTO`. It runs inside
 * SQLite, so it's safe while the file is in use and never copies a half-written transaction.
 */
export function backupTo(db: DatabaseSync, path: string): void {
  db.prepare('VACUUM INTO ?').run(path);
}

/** Run `fn` in a transaction: all of it is saved, or none of it. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
