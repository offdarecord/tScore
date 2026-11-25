/**
 * What Manage events shows about an event folder, read without opening the event: its name and
 * dates, how much space its card photos and everything else take, whether results are final, and
 * whether its card photos were already shrunk. See EventLibrary for the actions.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EventSetup } from '@tscore/core';
import { EVENT_FILE } from './event-store.js';

/** An event folder as Manage events lists it. */
export interface ManagedEvent {
  readonly folder: string;
  readonly name: string;
  readonly code: string;
  /** Day 1 and the last day (YYYY-MM-DD), if set. */
  readonly firstDate?: string;
  readonly lastDate?: string;
  readonly days: number;
  /** Card photos in `cards/`: how many and their total size in bytes. */
  readonly cardFiles: number;
  readonly cardBytes: number;
  /** Everything else in the folder: the event file, results, its own backups. */
  readonly otherBytes: number;
  /** Results are marked final and not reopened since. */
  readonly final: boolean;
  /** When its card photos were shrunk to small copies (ISO), if they were. */
  readonly scansRemovedAt?: string;
}

/** The audit kind recorded when card photos are shrunk. */
export const SCANS_REMOVED = 'event.scans_removed';

/** Card photos bigger than this are full-size; smaller ones are the small copies kept after. */
export const SMALL_COPY_MAX_BYTES = 40_000;

/** Read a folder's event without opening it (read-only), or undefined if it isn't an event. */
export function readManagedEvent(folder: string): ManagedEvent | undefined {
  const file = join(folder, EVENT_FILE);
  if (!existsSync(file)) return undefined;
  let setup: EventSetup;
  let final: boolean;
  let scansRemovedAt: string | undefined;
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const row = db.prepare('SELECT setup_json FROM event').get() as
        { setup_json: string } | undefined;
      if (!row) return undefined;
      setup = JSON.parse(row.setup_json) as EventSetup;
      const fin = db
        .prepare('SELECT reopened_at FROM results_final ORDER BY revision DESC LIMIT 1')
        .get() as { reopened_at: string | null } | undefined;
      final = fin !== undefined && fin.reopened_at === null;
      const removed = db
        .prepare('SELECT at FROM audit_event WHERE kind = ? ORDER BY seq DESC LIMIT 1')
        .get(SCANS_REMOVED) as { at: string } | undefined;
      scansRemovedAt = removed?.at;
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
  const cards = sizeOf(join(folder, 'cards'));
  const all = sizeOf(folder);
  const dates = setup.days.map((d) => d.date).filter((d): d is string => typeof d === 'string');
  return {
    folder,
    name: setup.event.name,
    code: setup.event.code,
    ...(dates[0] !== undefined && { firstDate: dates[0] }),
    ...(dates.length > 0 && { lastDate: [...dates].sort().at(-1) as string }),
    days: setup.days.length,
    cardFiles: cards.files,
    cardBytes: cards.bytes,
    otherBytes: all.bytes - cards.bytes,
    final,
    ...(scansRemovedAt !== undefined && { scansRemovedAt }),
  };
}

/** Files and bytes under a folder (0 if it doesn't exist). */
export function sizeOf(folder: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const walk = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      const s = statSync(path, { throwIfNoEntry: false });
      if (!s) continue;
      if (s.isDirectory()) walk(path);
      else {
        files++;
        bytes += s.size;
      }
    }
  };
  walk(folder);
  return { files, bytes };
}

/** The full-size card photos in an event folder: the ones Remove card scans shrinks. */
export function fullSizeCardPhotos(folder: string): string[] {
  const dir = join(folder, 'cards');
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => /\.(jpe?g|png)$/i.test(n))
    .map((n) => join(dir, n))
    .filter((p) => (statSync(p, { throwIfNoEntry: false })?.size ?? 0) > SMALL_COPY_MAX_BYTES);
}
