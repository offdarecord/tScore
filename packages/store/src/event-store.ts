/**
 * One event on disk: a folder holding `event.sqlite`, `cards/` (card images), `exports/` and
 * `backups/` (ADR 0005). All reads and writes of event data go through this class.
 *
 * - Every change is one transaction: it's all saved, or none of it is. A confirmed card is
 *   committed before `recordCard` returns, so the app can play the OK sound after it.
 * - Scores are append-only versions; every change is in the audit log (ADR 0007).
 * - `resultsInput()` hands the results engine the current scores. The engine never sees the
 *   database.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  classesFromSetup,
  scoringFromSetup,
  validateEventSetup,
  type CardInput,
  type ClassInput,
  type EntryInput,
  type EntryStatus,
  type EventInput,
  type EventSetup,
  type PenaltyInput,
  type Tier,
} from '@tscore/core';
import { backupTo, openDatabase, transaction } from './database.js';
import { StoreError } from './errors.js';

export const EVENT_FILE = 'event.sqlite';
export const EVENT_DIRS = ['cards', 'exports', 'backups'] as const;

/** Who and where changes come from, recorded on every row and audit event. */
export interface StoreContext {
  /** This laptop's id (a UUID kept in app settings), so a second station never clashes. */
  readonly stationId: string;
  /** The app version, recorded in the file. */
  readonly appVersion: string;
  /** Who is at the keyboard, if known. */
  readonly operator?: string;
  /** For tests. */
  readonly now?: () => Date;
  /** For tests. */
  readonly newId?: () => string;
}

/** Where a score came from: the scanner, the review queue, typed in, amended, or imported. */
export type ScoreSource = 'scan' | 'review' | 'manual' | 'amend' | 'import';

export interface RecordCard {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  /** One per section, from section 1. `null`: not decided yet (waiting in review). */
  readonly scores: readonly (number | null)[];
  readonly source: ScoreSource;
  /** Per section, the reader's confidence from 0 to 1, when scanned. */
  readonly confidence?: readonly (number | null)[];
  /** The card photo, relative to the event folder (e.g. `cards/12-1-2.jpg`). */
  readonly imagePath?: string;
}

export interface CorrectScore {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  /** From 1. */
  readonly section: number;
  readonly value: number | null;
  readonly source: ScoreSource;
  /** Optional: the desk is never asked for one (requirement N3). */
  readonly reason?: string;
}

export interface ScoreVersion {
  readonly id: string;
  readonly value: number | null;
  readonly source: ScoreSource;
  readonly confidence: number | null;
  readonly reason: string | null;
  readonly stationId: string;
  readonly operator: string | null;
  readonly createdAt: string;
  readonly supersededBy: string | null;
}

export interface AuditEvent {
  readonly seq: number;
  readonly at: string;
  readonly stationId: string;
  readonly operator: string | null;
  readonly kind: string;
  readonly subject: string | null;
  readonly detail: unknown;
}

interface EntryRow {
  number: number;
  riders_json: string;
  club: string | null;
  tier: Tier;
  status: EntryStatus;
  classes_json: string;
  ride_off_json: string | null;
}

export class EventStore {
  readonly folder: string;
  readonly eventId: string;
  readonly #db: DatabaseSync;
  readonly #ctx: StoreContext;
  #setup: EventSetup;

  private constructor(folder: string, db: DatabaseSync, ctx: StoreContext) {
    this.folder = folder;
    this.#db = db;
    this.#ctx = ctx;
    const row = db.prepare('SELECT id, setup_json FROM event').get() as
      { id: string; setup_json: string } | undefined;
    if (!row) throw new StoreError('STORE_NO_EVENT', 'The event file has no event in it.');
    this.eventId = row.id;
    this.#setup = JSON.parse(row.setup_json) as EventSetup;
  }

  /** Create a new event in an empty (or new) folder. */
  static create(folder: string, setup: unknown, ctx: StoreContext): EventStore {
    const valid = checkSetup(setup);
    if (existsSync(folder) && readdirSync(folder).length > 0) {
      throw new StoreError(
        'STORE_FOLDER_NOT_EMPTY',
        `The folder for a new event must be empty: ${folder}`,
      );
    }
    makeFolders(folder);
    const db = openDatabase(join(folder, EVENT_FILE), {
      create: true,
      backupPathBeforeMigration: () => '',
    });
    const now = stamp(ctx);
    const id = valid.event.id ?? newId(ctx);
    const stored: EventSetup = { ...valid, event: { ...valid.event, id } };
    transaction(db, () => {
      db.prepare(
        'INSERT INTO event (id, setup_json, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ).run(id, JSON.stringify(stored), now, now);
      setMeta(db, 'created_by_app', ctx.appVersion);
      setMeta(db, 'last_opened_by_app', ctx.appVersion);
      audit(db, ctx, 'event.create', id, { code: stored.event.code, name: stored.event.name });
    });
    return new EventStore(folder, db, ctx);
  }

  /** Open an existing event folder, migrating its file forward if it's from an older tScore. */
  static open(folder: string, ctx: StoreContext): EventStore {
    const file = join(folder, EVENT_FILE);
    if (!existsSync(file)) {
      throw new StoreError('STORE_NOT_AN_EVENT', `No tScore event in this folder: ${folder}`);
    }
    makeFolders(folder);
    const db = openDatabase(file, {
      create: false,
      backupPathBeforeMigration: (v) =>
        join(folder, 'backups', `${fileStamp(ctx)}-before-upgrade-from-v${v}.sqlite`),
    });
    setMeta(db, 'last_opened_by_app', ctx.appVersion);
    return new EventStore(folder, db, ctx);
  }

  close(): void {
    this.#db.close();
  }

  // ---- Setup ----

  get setup(): EventSetup {
    return this.#setup;
  }

  /** Replace the event setup (validated first). The event id can't change. */
  updateSetup(setup: unknown): void {
    const valid = checkSetup(setup);
    const stored: EventSetup = { ...valid, event: { ...valid.event, id: this.eventId } };
    this.#tx(() => {
      this.#db
        .prepare('UPDATE event SET setup_json = ?, updated_at = ?')
        .run(JSON.stringify(stored), stamp(this.#ctx));
      this.#audit('setup.update', this.eventId, { before: this.#setup, after: stored });
    });
    this.#setup = stored;
  }

  // ---- Riders ----

  entries(): EntryInput[] {
    const rows = this.#db
      .prepare('SELECT * FROM entry ORDER BY number')
      .all() as unknown as EntryRow[];
    const penalties = this.#penaltiesByNumber();
    return rows.map((r) => toEntry(r, penalties.get(r.number)));
  }

  entry(number: number): EntryInput {
    const row = this.#db.prepare('SELECT * FROM entry WHERE number = ?').get(number) as
      EntryRow | undefined;
    if (!row) throw new StoreError('STORE_NO_RIDER', `There's no rider number ${number}.`);
    return toEntry(row, this.#penaltiesByNumber().get(number));
  }

  /** Add a rider. Penalties on the input are ignored: use `addPenalty`. */
  addEntry(entry: EntryInput): void {
    this.#checkClasses(entry.number, entry.classes);
    const now = stamp(this.#ctx);
    this.#tx(() => {
      try {
        this.#db
          .prepare(
            `INSERT INTO entry (id, number, riders_json, club, tier, status, classes_json,
               ride_off_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            newId(this.#ctx),
            entry.number,
            JSON.stringify(entry.riders),
            entry.club ?? null,
            entry.tier,
            entry.status,
            JSON.stringify(entry.classes),
            entry.rideOff ? JSON.stringify(entry.rideOff) : null,
            now,
            now,
          );
      } catch (err) {
        if (String(err).includes('UNIQUE')) {
          throw new StoreError(
            'STORE_DUPLICATE_RIDER',
            `Rider number ${entry.number} is already entered.`,
          );
        }
        throw err;
      }
      const detail = Object.fromEntries(Object.entries(entry).filter(([k]) => k !== 'penalties'));
      this.#audit('entry.add', `rider ${entry.number}`, detail);
    });
  }

  /** Move a rider to another class (or classes), e.g. from Trial 4 Plus to Trial 4 on the day. */
  changeClasses(number: number, classes: readonly string[]): void {
    this.#checkClasses(number, classes);
    this.#updateEntry(
      number,
      'entry.classes',
      'classes_json',
      JSON.stringify(classes),
      (e) => e.classes,
    );
  }

  /** Mark a rider DNF or DNS, or back to riding. */
  setStatus(number: number, status: EntryStatus): void {
    this.#updateEntry(number, 'entry.status', 'status', status, (e) => e.status);
  }

  setTier(number: number, tier: Tier): void {
    this.#updateEntry(number, 'entry.tier', 'tier', tier, (e) => e.tier);
  }

  // ---- Cards and scores ----

  /**
   * Save a confirmed card: every section's score, in one transaction. Throws if the rider,
   * day or lap doesn't fit the event, a score isn't allowed, or the card is already in (use
   * `correctScore` to change one).
   */
  recordCard(card: RecordCard): string {
    const sections = this.#sectionsFor(card.number, card.day, card.lap);
    if (card.scores.length !== sections) {
      throw new StoreError(
        'STORE_WRONG_SECTION_COUNT',
        `Rider ${card.number}, day ${card.day} lap ${card.lap}: ${card.scores.length} scores, but the class rides ${sections} sections.`,
      );
    }
    card.scores.forEach((v, i) => this.#checkScore(v, card, i + 1));
    const now = stamp(this.#ctx);
    const cardId = newId(this.#ctx);
    this.#tx(() => {
      try {
        this.#db
          .prepare(
            `INSERT INTO card (id, number, day, lap, image_path, station_id, operator, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            cardId,
            card.number,
            card.day,
            card.lap,
            card.imagePath ?? null,
            this.#ctx.stationId,
            this.#ctx.operator ?? null,
            now,
          );
      } catch (err) {
        if (String(err).includes('UNIQUE')) {
          throw new StoreError(
            'STORE_DUPLICATE_CARD',
            `The card for rider ${card.number}, day ${card.day} lap ${card.lap} is already in.`,
          );
        }
        throw err;
      }
      const insert = this.#db.prepare(
        `INSERT INTO score_version (id, card_id, section, value, source, confidence, reason,
           station_id, operator, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      );
      card.scores.forEach((value, i) =>
        insert.run(
          newId(this.#ctx),
          cardId,
          i + 1,
          value,
          card.source,
          card.confidence?.[i] ?? null,
          this.#ctx.stationId,
          this.#ctx.operator ?? null,
          now,
        ),
      );
      this.#audit('card.record', `rider ${card.number} day ${card.day} lap ${card.lap}`, {
        scores: card.scores,
        source: card.source,
      });
    });
    return cardId;
  }

  /** Change one section's score. The old score is kept as history, never overwritten. */
  correctScore(change: CorrectScore): void {
    const card = this.#cardId(change.number, change.day, change.lap);
    this.#checkScore(change.value, change, change.section);
    const current = this.#db
      .prepare(
        'SELECT id, value FROM score_version WHERE card_id = ? AND section = ? AND superseded_by IS NULL',
      )
      .get(card, change.section) as { id: string; value: number | null } | undefined;
    if (!current) {
      throw new StoreError('STORE_NO_SECTION', `Section ${change.section} isn't on this card.`);
    }
    if (current.value === change.value) return;
    const id = newId(this.#ctx);
    this.#tx(() => {
      // Retire the current version, then add the new one (the link is checked at commit).
      this.#db
        .prepare('UPDATE score_version SET superseded_by = ? WHERE id = ?')
        .run(id, current.id);
      this.#db
        .prepare(
          `INSERT INTO score_version (id, card_id, section, value, source, confidence, reason,
             station_id, operator, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        )
        .run(
          id,
          card,
          change.section,
          change.value,
          change.source,
          change.reason ?? null,
          this.#ctx.stationId,
          this.#ctx.operator ?? null,
          stamp(this.#ctx),
        );
      this.#audit(
        'score.correct',
        `rider ${change.number} day ${change.day} lap ${change.lap} section ${change.section}`,
        {
          from: current.value,
          to: change.value,
          source: change.source,
          ...(change.reason !== undefined && { reason: change.reason }),
        },
      );
    });
  }

  /** The current version of every card. */
  cards(): CardInput[] {
    const rows = this.#db
      .prepare(
        `SELECT c.number, c.day, c.lap, s.section, s.value
           FROM card c JOIN score_version s ON s.card_id = c.id AND s.superseded_by IS NULL
          ORDER BY c.number, c.day, c.lap, s.section`,
      )
      .all() as {
      number: number;
      day: number;
      lap: number;
      section: number;
      value: number | null;
    }[];
    const out: CardInput[] = [];
    let last: { number: number; day: number; lap: number; scores: (number | null)[] } | undefined;
    for (const r of rows) {
      if (!last || last.number !== r.number || last.day !== r.day || last.lap !== r.lap) {
        last = { number: r.number, day: r.day, lap: r.lap, scores: [] };
        out.push(last);
      }
      last.scores[r.section - 1] = r.value;
    }
    return out;
  }

  /** Every version of one section's score, oldest first. */
  scoreHistory(number: number, day: number, lap: number, section: number): ScoreVersion[] {
    const card = this.#cardId(number, day, lap);
    const rows = this.#db
      .prepare(
        `SELECT id, value, source, confidence, reason, station_id, operator, created_at, superseded_by
           FROM score_version WHERE card_id = ? AND section = ? ORDER BY rowid`,
      )
      .all(card, section) as {
      id: string;
      value: number | null;
      source: ScoreSource;
      confidence: number | null;
      reason: string | null;
      station_id: string;
      operator: string | null;
      created_at: string;
      superseded_by: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      value: r.value,
      source: r.source,
      confidence: r.confidence,
      reason: r.reason,
      stationId: r.station_id,
      operator: r.operator,
      createdAt: r.created_at,
      supersededBy: r.superseded_by,
    }));
  }

  // ---- Penalties ----

  addPenalty(number: number, penalty: PenaltyInput): string {
    this.entry(number);
    const id = newId(this.#ctx);
    this.#tx(() => {
      this.#db
        .prepare(
          `INSERT INTO penalty (id, number, points, reason, note, day, lap, classes_json,
             station_id, operator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          number,
          penalty.points,
          penalty.reason,
          penalty.note ?? null,
          penalty.day ?? null,
          penalty.lap ?? null,
          penalty.classes ? JSON.stringify(penalty.classes) : null,
          this.#ctx.stationId,
          this.#ctx.operator ?? null,
          stamp(this.#ctx),
        );
      this.#audit('penalty.add', `rider ${number}`, { id, ...penalty });
    });
    return id;
  }

  removePenalty(id: string): void {
    this.#tx(() => {
      const r = this.#db
        .prepare('UPDATE penalty SET removed_at = ? WHERE id = ? AND removed_at IS NULL')
        .run(stamp(this.#ctx), id);
      if (r.changes === 0)
        throw new StoreError('STORE_NO_PENALTY', 'That penalty is not in force.');
      this.#audit('penalty.remove', id, {});
    });
  }

  // ---- Audit, results, backups ----

  auditLog(): AuditEvent[] {
    const rows = this.#db.prepare('SELECT * FROM audit_event ORDER BY seq').all() as {
      seq: number;
      at: string;
      station_id: string;
      operator: string | null;
      kind: string;
      subject: string | null;
      detail_json: string;
    }[];
    return rows.map((r) => ({
      seq: r.seq,
      at: r.at,
      stationId: r.station_id,
      operator: r.operator,
      kind: r.kind,
      subject: r.subject,
      detail: JSON.parse(r.detail_json) as unknown,
    }));
  }

  /** Everything the results engine needs, from the current scores. */
  resultsInput(): EventInput {
    const s = this.#setup;
    return {
      id: this.eventId,
      code: s.event.code,
      name: s.event.name,
      ...(s.event.club !== undefined && { club: s.event.club }),
      ...(s.event.venue !== undefined && { venue: s.event.venue }),
      ...(s.event.permit !== undefined && { permit: s.event.permit }),
      days: s.days.map((d) => {
        if (!d.date) {
          throw new StoreError('STORE_NO_DATE', `Set the date for day ${d.day} in Event setup.`);
        }
        return { day: d.day, date: d.date };
      }),
      scoring: scoringFromSetup(s),
      classes: classesFromSetup(s),
      entries: this.entries(),
      cards: this.cards(),
    };
  }

  /**
   * Save a consistent copy of the event file in `backups/` and return its path. Keeps the
   * newest `keep` automatic backups; named ones (label other than "auto") are never pruned.
   */
  backup(label = 'auto', keep = 20): string {
    const dir = join(this.folder, 'backups');
    const path = join(dir, `${fileStamp(this.#ctx)}-${label}.sqlite`);
    backupTo(this.#db, path);
    if (label === 'auto') {
      const autos = readdirSync(dir)
        .filter((f) => f.endsWith('-auto.sqlite'))
        .sort();
      for (const old of autos.slice(0, Math.max(0, autos.length - keep))) rmSync(join(dir, old));
    }
    return path;
  }

  // ---- Internals ----

  #tx<T>(fn: () => T): T {
    return transaction(this.#db, fn);
  }

  #audit(kind: string, subject: string | null, detail: unknown): void {
    audit(this.#db, this.#ctx, kind, subject, detail);
  }

  #updateEntry(
    number: number,
    kind: string,
    column: 'classes_json' | 'status' | 'tier',
    value: string,
    read: (e: EntryInput) => unknown,
  ): void {
    const before = read(this.entry(number));
    this.#tx(() => {
      this.#db
        .prepare(`UPDATE entry SET ${column} = ?, updated_at = ? WHERE number = ?`)
        .run(value, stamp(this.#ctx), number);
      this.#audit(kind, `rider ${number}`, { from: before, to: read(this.entry(number)) });
    });
  }

  #classes(): Map<string, ClassInput> {
    return new Map(classesFromSetup(this.#setup).map((c) => [c.name, c]));
  }

  #checkClasses(number: number, classes: readonly string[]): void {
    if (classes.length < 1 || classes.length > 2) {
      throw new StoreError('STORE_CLASS_COUNT', `Rider ${number} must be in one or two classes.`);
    }
    const known = this.#classes();
    for (const c of classes) {
      if (!known.has(c)) throw new StoreError('STORE_NO_CLASS', `There's no class called "${c}".`);
    }
  }

  /** Sections on the rider's card for that day and lap (their first class decides). */
  #sectionsFor(number: number, day: number, lap: number): number {
    const entry = this.entry(number);
    const cls = this.#classes().get(entry.classes[0] ?? '');
    const d = cls?.days.find((x) => x.day === day);
    if (!d) {
      throw new StoreError('STORE_NO_DAY', `Rider ${number}'s class doesn't ride on day ${day}.`);
    }
    if (lap < 1 || lap > d.laps) {
      throw new StoreError(
        'STORE_NO_LAP',
        `Rider ${number}'s class rides ${d.laps} laps on day ${day}; there's no lap ${lap}.`,
      );
    }
    return d.sections;
  }

  #checkScore(
    value: number | null,
    where: { number: number; day: number; lap: number },
    section: number,
  ): void {
    if (value === null) return;
    const allowed = scoringFromSetup(this.#setup).scoreValues;
    if (!allowed.includes(value)) {
      throw new StoreError(
        'STORE_BAD_SCORE',
        `Rider ${where.number}, day ${where.day} lap ${where.lap} section ${section}: ${value} isn't a score (allowed: ${allowed.join(', ')}).`,
      );
    }
  }

  #cardId(number: number, day: number, lap: number): string {
    const row = this.#db
      .prepare('SELECT id FROM card WHERE number = ? AND day = ? AND lap = ?')
      .get(number, day, lap) as { id: string } | undefined;
    if (!row) {
      throw new StoreError(
        'STORE_NO_CARD',
        `There's no card yet for rider ${number}, day ${day} lap ${lap}.`,
      );
    }
    return row.id;
  }

  #penaltiesByNumber(): Map<number, PenaltyInput[]> {
    const rows = this.#db
      .prepare('SELECT * FROM penalty WHERE removed_at IS NULL ORDER BY created_at, rowid')
      .all() as {
      number: number;
      points: number;
      reason: string;
      note: string | null;
      day: number | null;
      lap: number | null;
      classes_json: string | null;
    }[];
    const out = new Map<number, PenaltyInput[]>();
    for (const r of rows) {
      const p = {
        points: r.points,
        reason: r.reason,
        ...(r.note !== null && { note: r.note }),
        ...(r.day !== null && { day: r.day }),
        ...(r.lap !== null && { lap: r.lap }),
        ...(r.classes_json !== null && { classes: JSON.parse(r.classes_json) as string[] }),
      } as PenaltyInput;
      out.set(r.number, [...(out.get(r.number) ?? []), p]);
    }
    return out;
  }
}

function toEntry(r: EntryRow, penalties: PenaltyInput[] | undefined): EntryInput {
  return {
    number: r.number,
    riders: JSON.parse(r.riders_json) as EntryInput['riders'],
    ...(r.club !== null && { club: r.club }),
    tier: r.tier,
    status: r.status,
    classes: JSON.parse(r.classes_json) as string[],
    ...(penalties && { penalties }),
    ...(r.ride_off_json !== null && {
      rideOff: JSON.parse(r.ride_off_json) as Record<string, number>,
    }),
  };
}

function checkSetup(setup: unknown): EventSetup {
  const r = validateEventSetup(setup);
  if (!r.ok) {
    const first = r.issues
      .slice(0, 3)
      .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
      .join('; ');
    throw new StoreError('STORE_BAD_SETUP', `The event setup isn't valid: ${first}`);
  }
  return r.value;
}

function makeFolders(folder: string): void {
  mkdirSync(folder, { recursive: true });
  for (const d of EVENT_DIRS) mkdirSync(join(folder, d), { recursive: true });
}

function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

function audit(
  db: DatabaseSync,
  ctx: StoreContext,
  kind: string,
  subject: string | null,
  detail: unknown,
): void {
  db.prepare(
    'INSERT INTO audit_event (id, at, station_id, operator, kind, subject, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    newId(ctx),
    stamp(ctx),
    ctx.stationId,
    ctx.operator ?? null,
    kind,
    subject,
    JSON.stringify(detail),
  );
}

function newId(ctx: StoreContext): string {
  return ctx.newId?.() ?? randomUUID();
}

function stamp(ctx: StoreContext): string {
  return (ctx.now?.() ?? new Date()).toISOString();
}

/** A timestamp safe in file names, sorting in time order: 20261123T104512123Z. */
function fileStamp(ctx: StoreContext): string {
  return stamp(ctx).replace(/[-:.]/g, '');
}
