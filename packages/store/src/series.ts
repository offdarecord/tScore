/**
 * Series on this laptop: each series is a small JSON file in the events folder's `Series`
 * folder (Documents\tScore\Series), listing its rounds (event folders) and its rules. Each
 * round's results are read straight from its event file, read-only, so working out a tally
 * never changes an event.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  juniorClassesFromSetup,
  type EventSetup,
  type Results,
  type SeriesRules,
} from '@tscore/core';
import { StoreError } from './errors.js';
import { EVENT_FILE } from './event-store.js';
import { SCHEMA_VERSION } from './migrations.js';

export const SERIES_FORMAT = 'tscore.series_setup/1' as const;
export const SERIES_DIR = 'Series';

export interface SeriesSetup {
  readonly schema: typeof SERIES_FORMAT;
  readonly name: string;
  /** Event folders, one per round. Rounds are numbered by date. */
  readonly rounds: readonly string[];
  readonly rules: SeriesRules;
}

/** A round as the series sees it. */
export interface SeriesRoundInfo {
  readonly folder: string;
  readonly name: string;
  readonly code: string;
  readonly date?: string;
  /** final: counted. provisional or reopened: not counted yet. missing: folder not found. */
  readonly state: 'final' | 'provisional' | 'reopened' | 'missing' | 'unreadable';
  readonly revision?: number;
  readonly results?: Results;
  /** The round's junior classes, for surnames as an initial in anything shared. */
  readonly juniorClasses: readonly string[];
}

/** Read one round from its event folder without changing anything. */
export function readSeriesRound(folder: string): SeriesRoundInfo {
  const file = join(folder, EVENT_FILE);
  const blank = { folder, name: '', code: '', juniorClasses: [] };
  if (!existsSync(file)) return { ...blank, state: 'missing' };
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const { user_version: version } = db.prepare('PRAGMA user_version').get() as {
      user_version: number;
    };
    if (version > SCHEMA_VERSION) return { ...blank, state: 'unreadable' };
    const row = db.prepare('SELECT setup_json FROM event').get() as
      { setup_json: string } | undefined;
    if (!row) return { ...blank, state: 'unreadable' };
    const setup = JSON.parse(row.setup_json) as EventSetup;
    const info = {
      folder,
      name: setup.event.name,
      code: setup.event.code,
      ...(setup.days[0]?.date !== undefined && { date: setup.days[0].date }),
      juniorClasses: juniorClassesFromSetup(setup),
    };
    // Files from before results could be marked final (schema 6) have no final results.
    if (version < 6) return { ...info, state: 'provisional' };
    const final = db
      .prepare(
        'SELECT revision, results_json, reopened_at FROM results_final ORDER BY revision DESC LIMIT 1',
      )
      .get() as { revision: number; results_json: string; reopened_at: string | null } | undefined;
    if (!final) return { ...info, state: 'provisional' };
    if (final.reopened_at) return { ...info, state: 'reopened', revision: final.revision };
    return {
      ...info,
      state: 'final',
      revision: final.revision,
      results: JSON.parse(final.results_json) as Results,
    };
  } catch {
    return { ...blank, state: 'unreadable' };
  } finally {
    db?.close();
  }
}

/** The series saved on this laptop, by name. */
export function listSeries(eventsDir: string): { file: string; setup: SeriesSetup }[] {
  const dir = join(eventsDir, SERIES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        const setup = JSON.parse(readFileSync(join(dir, f), 'utf8')) as SeriesSetup;
        return setup.schema === SERIES_FORMAT ? [{ file: join(dir, f), setup }] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.setup.name.localeCompare(b.setup.name));
}

/** Save a series (a new file, or over `file`). Returns its file. */
export function saveSeries(eventsDir: string, setup: SeriesSetup, file?: string): string {
  const name = setup.name.trim();
  if (!name) throw new StoreError('STORE_SERIES_NAME', 'Give the series a name.');
  const dir = join(eventsDir, SERIES_DIR);
  mkdirSync(dir, { recursive: true });
  let target = file && file.startsWith(dir) ? file : undefined;
  if (!target) {
    const base = name.replace(/[<>:"/\|?*]/g, '_').slice(0, 80);
    target = join(dir, `${base}.json`);
    for (let n = 2; existsSync(target); n++) target = join(dir, `${base} (${n}).json`);
  }
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...setup, name }, null, 2));
  renameSync(tmp, target);
  return target;
}

/** Delete a series file (never its rounds' events). */
export function deleteSeries(eventsDir: string, file: string): void {
  const dir = join(eventsDir, SERIES_DIR);
  if (file.startsWith(dir) && file.endsWith('.json')) rmSync(file, { force: true });
}
