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
  CLUB_MAX,
  MACHINE_MAX,
  NAME_MAX,
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
  type CompetitionStatus,
} from '@tscore/core';
import { backupTo, openDatabase, transaction } from './database.js';
import { SetupError, StoreError } from './errors.js';

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
  /** Per section, why it's undecided when scanned (e.g. NO_PUNCH), for the review queue. */
  readonly reasons?: readonly (string | null)[];
  /** The card photo, relative to the event folder (e.g. `cards/12-1-2.jpg`). */
  readonly imagePath?: string;
  /**
   * When the desk got the card (ISO 8601). Defaults to now; the desk changes it only for a card
   * handed in earlier. Lap times are worked out from it.
   */
  readonly receivedAt?: string;
}

/** Replace a whole card's scores (an edit on Manual entry). Unchanged sections are left alone. */
export interface AmendCard {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  readonly scores: readonly (number | null)[];
  readonly source: ScoreSource;
}

/** A card as the desk lists it: current scores, when it came in and how it was entered. */
export interface CardSummary {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  readonly scores: readonly (number | null)[];
  readonly receivedAt: string;
  /** How the card was first entered. */
  readonly source: ScoreSource;
  /** Any score changed since. */
  readonly edited: boolean;
}

/** A scanned card with sections still to decide (the review queue). */
export interface ReviewCard {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  /** The card photo, relative to the event folder. */
  readonly imagePath: string | null;
  readonly receivedAt: string;
  readonly sections: readonly { readonly section: number; readonly reason: string | null }[];
}

/** A revision of the results marked final. */
export interface FinalState {
  readonly revision: number;
  readonly markedAt: string;
  /** Reopened to correct something: the next "mark final" makes the next revision. */
  readonly reopened: boolean;
  readonly reopenedAt?: string;
  readonly reopenReason?: string;
}

interface FinalRow {
  revision: number;
  marked_at: string;
  reopened_at: string | null;
  reopen_reason: string | null;
}

const toFinalState = (r: FinalRow): FinalState => ({
  revision: r.revision,
  markedAt: r.marked_at,
  reopened: r.reopened_at !== null,
  ...(r.reopened_at !== null && { reopenedAt: r.reopened_at }),
  ...(r.reopen_reason !== null && { reopenReason: r.reopen_reason }),
});

/** One card label: a rider's card for one lap of one day. */
export interface LabelKey {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
}

/** A penalty in force, with its id (to remove it). */
export interface PenaltyRecord extends PenaltyInput {
  readonly id: string;
  readonly number: number;
  readonly createdAt: string;
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
  machine: string | null;
  competition_status: CompetitionStatus;
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

  /**
   * Replace the event setup (validated first). The event id can't change. Changes after riders
   * and cards exist are allowed (and logged), except ones that would strand them: removing a
   * class that has riders, or a day, lap or section that already has scores.
   */
  updateSetup(setup: unknown): void {
    this.#assertOpen();
    const valid = checkSetup(setup);
    this.#checkSetupChange(valid);
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
    this.#assertOpen();
    this.#checkClasses(entry.number, entry.classes);
    this.#tx(() => this.#insertEntry(entry));
  }

  /**
   * Add riders from an entry list, and save the class names the desk matched as aliases, all
   * in one transaction: every rider is added, or none is.
   */
  importEntries(
    entries: readonly EntryInput[],
    aliases: readonly { readonly className: string; readonly alias: string }[] = [],
    source = 'entry list',
  ): void {
    this.#assertOpen();
    let setup = this.#setup;
    if (aliases.length > 0) {
      setup = {
        ...setup,
        classes: setup.classes.map((c) => {
          const add = aliases
            .filter((a) => a.className === c.name)
            .map((a) => a.alias)
            .filter((a) => !(c.aliases ?? []).some((x) => x.toLowerCase() === a.toLowerCase()));
          return add.length ? { ...c, aliases: [...(c.aliases ?? []), ...add] } : c;
        }),
      };
      checkSetup(setup);
    }
    for (const e of entries) this.#checkClasses(e.number, e.classes);
    this.#tx(() => {
      if (setup !== this.#setup) {
        this.#db
          .prepare('UPDATE event SET setup_json = ?, updated_at = ?')
          .run(JSON.stringify(setup), stamp(this.#ctx));
        this.#audit('setup.aliases', this.eventId, { added: aliases });
      }
      for (const e of entries) this.#insertEntry(e);
      this.#audit('entry.import', this.eventId, { source, riders: entries.length });
    });
    this.#setup = setup;
  }

  #insertEntry(entry: EntryInput): void {
    const now = stamp(this.#ctx);
    {
      try {
        this.#db
          .prepare(
            `INSERT INTO entry (id, number, riders_json, club, machine, competition_status, status,
               classes_json, ride_off_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            newId(this.#ctx),
            entry.number,
            JSON.stringify(entry.riders),
            entry.club ?? null,
            entry.machine ?? null,
            entry.competitionStatus,
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
    }
  }

  /** Move a rider to another class (or classes), e.g. from Trial 4 Plus to Trial 4 on the day. */
  changeClasses(number: number, classes: readonly string[]): void {
    this.#assertOpen();
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
    this.#assertOpen();
    this.#updateEntry(number, 'entry.status', 'status', status, (e) => e.status);
  }

  setCompetitionStatus(number: number, competitionStatus: CompetitionStatus): void {
    this.#assertOpen();
    this.#updateEntry(
      number,
      'entry.competition_status',
      'competition_status',
      competitionStatus,
      (e) => e.competitionStatus,
    );
  }

  /**
   * Correct the names on an entry (a rider who mistyped their own name, or a sidecar passenger
   * change): one name per rider already on the entry, in the same order. Licence numbers stay.
   * The rider number never changes, so cards already scanned still belong to this entry.
   */
  renameRiders(
    number: number,
    names: readonly { readonly givenName: string; readonly familyName: string }[],
  ): void {
    this.#assertOpen();
    const current = this.entry(number).riders;
    if (names.length !== current.length) {
      throw new StoreError(
        'STORE_BAD_NAME',
        current.length === 2 ? 'Give the driver and the passenger a name.' : 'Give one name.',
      );
    }
    const riders = current.map((p, i) => {
      const givenName = tidyText(names[i]?.givenName ?? '');
      const familyName = tidyText(names[i]?.familyName ?? '');
      if (!givenName && !familyName) {
        throw new StoreError('STORE_BAD_NAME', 'A rider needs a first name or a surname.');
      }
      if (givenName.length > NAME_MAX || familyName.length > NAME_MAX) {
        throw new StoreError('STORE_BAD_NAME', `Names can be up to ${NAME_MAX} characters.`);
      }
      return { ...p, givenName, familyName };
    });
    this.#updateEntry(number, 'entry.names', 'riders_json', JSON.stringify(riders), (e) =>
      e.riders.map((p) => ({ givenName: p.givenName, familyName: p.familyName })),
    );
  }

  /** Change or clear the rider's club. */
  setClub(number: number, club: string | null): void {
    this.#assertOpen();
    const value = tidyText(club ?? '');
    if (value.length > CLUB_MAX) {
      throw new StoreError('STORE_BAD_CLUB', `A club can be up to ${CLUB_MAX} characters.`);
    }
    this.#updateEntry(number, 'entry.club', 'club', value || null, (e) => e.club ?? null);
  }

  /** Change or clear the rider's machine, e.g. after a bike change on the day. */
  setMachine(number: number, machine: string | null): void {
    const value = tidyText(machine ?? '');
    if (value.length > MACHINE_MAX) {
      throw new StoreError(
        'STORE_BAD_MACHINE',
        `A machine can be up to ${MACHINE_MAX} characters.`,
      );
    }
    this.#updateEntry(number, 'entry.machine', 'machine', value || null, (e) => e.machine ?? null);
  }

  // ---- Cards and scores ----

  /**
   * Save a confirmed card: every section's score, in one transaction. Throws if the rider,
   * day or lap doesn't fit the event, a score isn't allowed, or the card is already in (use
   * `correctScore` to change one).
   */
  recordCard(card: RecordCard): string {
    this.#assertOpen();
    const sections = this.#sectionsFor(card.number, card.day, card.lap);
    if (card.scores.length !== sections) {
      throw new StoreError(
        'STORE_WRONG_SECTION_COUNT',
        `Rider ${card.number}, day ${card.day} lap ${card.lap}: ${card.scores.length} scores, but the class rides ${sections} sections.`,
      );
    }
    card.scores.forEach((v, i) => this.#checkScore(v, card, i + 1));
    const now = stamp(this.#ctx);
    const receivedAt = card.receivedAt === undefined ? now : checkTime(card.receivedAt);
    const cardId = newId(this.#ctx);
    this.#tx(() => {
      try {
        this.#db
          .prepare(
            `INSERT INTO card (id, number, day, lap, image_path, station_id, operator, created_at,
               received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            receivedAt,
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
           station_id, operator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      card.scores.forEach((value, i) =>
        insert.run(
          newId(this.#ctx),
          cardId,
          i + 1,
          value,
          card.source,
          card.confidence?.[i] ?? null,
          card.reasons?.[i] ?? null,
          this.#ctx.stationId,
          this.#ctx.operator ?? null,
          now,
        ),
      );
      this.#audit('card.record', `rider ${card.number} day ${card.day} lap ${card.lap}`, {
        scores: card.scores,
        source: card.source,
        ...(receivedAt !== now && { receivedAt }),
      });
    });
    return cardId;
  }

  /**
   * Scanned cards waiting for a person: any section still undecided (null). Oldest first, with
   * the photo and, for each undecided section, why the reader couldn't decide.
   */
  reviewCards(): ReviewCard[] {
    const rows = this.#db
      .prepare(
        `SELECT c.number, c.day, c.lap, c.image_path, coalesce(c.received_at, c.created_at) AS received_at,
                s.section, s.reason
           FROM card c JOIN score_version s ON s.card_id = c.id
          WHERE s.superseded_by IS NULL AND s.value IS NULL
          ORDER BY c.rowid, s.section`,
      )
      .all() as {
      number: number;
      day: number;
      lap: number;
      image_path: string | null;
      received_at: string;
      section: number;
      reason: string | null;
    }[];
    const out = new Map<
      string,
      ReviewCard & { sections: { section: number; reason: string | null }[] }
    >();
    for (const r of rows) {
      const key = `${r.number}/${r.day}/${r.lap}`;
      let c = out.get(key);
      if (!c) {
        c = {
          number: r.number,
          day: r.day,
          lap: r.lap,
          imagePath: r.image_path,
          receivedAt: r.received_at,
          sections: [],
        };
        out.set(key, c);
      }
      c.sections.push({ section: r.section, reason: r.reason });
    }
    return [...out.values()];
  }

  /** Change one section's score. The old score is kept as history, never overwritten. */
  correctScore(change: CorrectScore): void {
    this.#assertOpen();
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
    this.#tx(() => {
      this.#supersede(card, change.section, current.id, change.value, change.source, change.reason);
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

  /**
   * Replace a card's scores in one go (editing a card on Manual entry), in one transaction.
   * Only sections whose score changes get a new version; the old ones are kept. Returns how
   * many sections changed.
   */
  amendCard(change: AmendCard): number {
    this.#assertOpen();
    const card = this.#cardId(change.number, change.day, change.lap);
    const sections = this.#sectionsFor(change.number, change.day, change.lap);
    if (change.scores.length !== sections) {
      throw new StoreError(
        'STORE_WRONG_SECTION_COUNT',
        `Rider ${change.number}, day ${change.day} lap ${change.lap}: ${change.scores.length} scores, but the class rides ${sections} sections.`,
      );
    }
    change.scores.forEach((v, i) => this.#checkScore(v, change, i + 1));
    const current = this.#db
      .prepare(
        'SELECT id, section, value FROM score_version WHERE card_id = ? AND superseded_by IS NULL',
      )
      .all(card) as { id: string; section: number; value: number | null }[];
    const bySection = new Map(current.map((r) => [r.section, r]));
    const changes = change.scores
      .map((value, i) => ({ section: i + 1, value, was: bySection.get(i + 1) }))
      .filter((c) => c.was !== undefined && c.was.value !== c.value);
    if (changes.length === 0) return 0;
    this.#tx(() => {
      for (const c of changes) {
        if (c.was) this.#supersede(card, c.section, c.was.id, c.value, change.source);
      }
      this.#audit('card.amend', `rider ${change.number} day ${change.day} lap ${change.lap}`, {
        changes: changes.map((c) => ({ section: c.section, from: c.was?.value, to: c.value })),
        source: change.source,
      });
    });
    return changes.length;
  }

  /** Every card with its current scores, newest first, as the desk lists them. */
  cardLog(): CardSummary[] {
    const rows = this.#db
      .prepare(
        `SELECT c.id, c.number, c.day, c.lap, coalesce(c.received_at, c.created_at) AS received_at,
                s.section, s.value, s.superseded_by,
                (SELECT f.source FROM score_version f WHERE f.card_id = c.id
                  ORDER BY f.rowid LIMIT 1) AS first_source
           FROM card c JOIN score_version s ON s.card_id = c.id
          ORDER BY c.rowid DESC, s.section, s.rowid`,
      )
      .all() as {
      id: string;
      number: number;
      day: number;
      lap: number;
      received_at: string;
      section: number;
      value: number | null;
      superseded_by: string | null;
      first_source: ScoreSource;
    }[];
    // Rows arrive grouped by card (newest card first); Map keeps that order.
    const byCard = new Map<
      string,
      { first: (typeof rows)[number]; scores: (number | null)[]; edited: boolean }
    >();
    for (const r of rows) {
      let c = byCard.get(r.id);
      if (!c) {
        c = { first: r, scores: [], edited: false };
        byCard.set(r.id, c);
      }
      if (r.superseded_by === null) c.scores[r.section - 1] = r.value;
      else c.edited = true;
    }
    return [...byCard.values()].map(({ first, scores, edited }) => ({
      number: first.number,
      day: first.day,
      lap: first.lap,
      scores,
      receivedAt: first.received_at,
      source: first.first_source,
      edited,
    }));
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
    this.#assertOpen();
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

  /** Penalties in force, oldest first. */
  penaltyList(): PenaltyRecord[] {
    const rows = this.#db
      .prepare('SELECT * FROM penalty WHERE removed_at IS NULL ORDER BY created_at, rowid')
      .all() as {
      id: string;
      number: number;
      points: number;
      reason: PenaltyInput['reason'];
      note: string | null;
      day: number | null;
      lap: number | null;
      classes_json: string | null;
      created_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      createdAt: r.created_at,
      points: r.points,
      reason: r.reason,
      ...(r.note !== null && { note: r.note }),
      ...(r.day !== null && { day: r.day }),
      ...(r.lap !== null && { lap: r.lap }),
      ...(r.classes_json !== null && { classes: JSON.parse(r.classes_json) as string[] }),
    }));
  }

  removePenalty(id: string): void {
    this.#assertOpen();
    this.#tx(() => {
      const r = this.#db
        .prepare('UPDATE penalty SET removed_at = ? WHERE id = ? AND removed_at IS NULL')
        .run(stamp(this.#ctx), id);
      if (r.changes === 0)
        throw new StoreError('STORE_NO_PENALTY', 'That penalty is not in force.');
      this.#audit('penalty.remove', id, {});
    });
  }

  // ---- Card labels ----

  /** Record that these labels were saved for printing (`what` says which: all, a rider, …). */
  recordLabelsPrinted(labels: readonly LabelKey[], what: string): void {
    if (labels.length === 0) return;
    this.#tx(() => {
      const at = stamp(this.#ctx);
      const insert = this.#db.prepare(
        'INSERT INTO label_print (number, day, lap, printed_at, station_id) VALUES (?, ?, ?, ?, ?)',
      );
      for (const l of labels) insert.run(l.number, l.day, l.lap, at, this.#ctx.stationId);
      const riders = new Set(labels.map((l) => l.number)).size;
      this.#audit('labels.print', this.eventId, { what, labels: labels.length, riders });
    });
  }

  /** Every label printed at least once. */
  printedLabels(): LabelKey[] {
    return this.#db
      .prepare('SELECT DISTINCT number, day, lap FROM label_print ORDER BY number, day, lap')
      .all() as unknown as LabelKey[];
  }

  // ---- Results marked final ----

  /** The latest revision marked final, if any, and whether it has been reopened. */
  finalState(): FinalState | null {
    const row = this.#db
      .prepare('SELECT * FROM results_final ORDER BY revision DESC LIMIT 1')
      .get() as FinalRow | undefined;
    return row ? toFinalState(row) : null;
  }

  /** Every revision marked final, oldest first. */
  finalHistory(): FinalState[] {
    const rows = this.#db
      .prepare('SELECT * FROM results_final ORDER BY revision')
      .all() as unknown as FinalRow[];
    return rows.map(toFinalState);
  }

  /** The results exactly as declared in a revision. */
  finalResults(revision: number): unknown {
    const row = this.#db
      .prepare('SELECT results_json FROM results_final WHERE revision = ?')
      .get(revision) as { results_json: string } | undefined;
    if (!row) throw new StoreError('STORE_NO_REVISION', `There's no revision ${revision}.`);
    return JSON.parse(row.results_json) as unknown;
  }

  /** The revision the next "mark final" will be. */
  nextRevision(): number {
    return (this.finalState()?.revision ?? 0) + 1;
  }

  /**
   * Mark the results final as revision `nextRevision()`, keeping them exactly as given. Until
   * they're reopened, nothing that affects results can change.
   */
  markFinal(revision: number, results: unknown): void {
    this.#assertOpen();
    if (revision !== this.nextRevision()) {
      throw new StoreError('STORE_REVISION_CHANGED', 'The results changed. Try again.');
    }
    this.#tx(() => {
      this.#db
        .prepare(
          `INSERT INTO results_final (revision, marked_at, station_id, operator, results_json)
             VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          revision,
          stamp(this.#ctx),
          this.#ctx.stationId,
          this.#ctx.operator ?? null,
          JSON.stringify(results),
        );
      this.#audit('results.final', this.eventId, { revision });
    });
  }

  /** Reopen final results to correct something. The reason is kept with the revision. */
  reopenResults(reason: string): void {
    const state = this.finalState();
    if (!state || state.reopened) {
      throw new StoreError('STORE_NOT_FINAL', "The results aren't final.");
    }
    const why = tidyText(reason);
    if (!why || why.length > 300) {
      throw new StoreError('STORE_NEED_REASON', 'Say why the results are being reopened.');
    }
    this.#tx(() => {
      this.#db
        .prepare('UPDATE results_final SET reopened_at = ?, reopen_reason = ? WHERE revision = ?')
        .run(stamp(this.#ctx), why, state.revision);
      this.#audit('results.reopen', this.eventId, { revision: state.revision, reason: why });
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

  /** Goes up with every change to the event (each one is audited), so backups know when to run. */
  changeMark(): number {
    const row = this.#db.prepare('SELECT MAX(seq) AS seq FROM audit_event').get() as {
      seq: number | null;
    };
    return row.seq ?? 0;
  }

  /** Record that this event was restored from a backup file (the file name only). */
  noteRestored(from: string): void {
    this.#tx(() => this.#audit('event.restore', this.eventId, { from }));
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

  /** Refuse changes that would alter results marked final. */
  #assertOpen(): void {
    const state = this.finalState();
    if (state && !state.reopened) {
      throw new StoreError(
        'STORE_RESULTS_FINAL',
        `Results are final (revision ${state.revision}). Reopen them on the Results screen to change anything that affects them.`,
      );
    }
  }

  #tx<T>(fn: () => T): T {
    return transaction(this.#db, fn);
  }

  #audit(kind: string, subject: string | null, detail: unknown): void {
    audit(this.#db, this.#ctx, kind, subject, detail);
  }

  /** Retire a score version and add its replacement. Call inside a transaction. */
  #supersede(
    cardId: string,
    section: number,
    currentId: string,
    value: number | null,
    source: ScoreSource,
    reason?: string,
  ): void {
    const id = newId(this.#ctx);
    // Retire the current version, then add the new one (the link is checked at commit).
    this.#db.prepare('UPDATE score_version SET superseded_by = ? WHERE id = ?').run(id, currentId);
    this.#db
      .prepare(
        `INSERT INTO score_version (id, card_id, section, value, source, confidence, reason,
           station_id, operator, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      )
      .run(
        id,
        cardId,
        section,
        value,
        source,
        reason ?? null,
        this.#ctx.stationId,
        this.#ctx.operator ?? null,
        stamp(this.#ctx),
      );
  }

  #updateEntry(
    number: number,
    kind: string,
    column: 'classes_json' | 'status' | 'competition_status' | 'riders_json' | 'club' | 'machine',
    value: string | null,
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

  #checkSetupChange(next: EventSetup): void {
    const classes = new Map(classesFromSetup(next).map((c) => [c.name, c]));
    const entries = this.entries();
    for (const e of entries) {
      for (const c of e.classes) {
        if (!classes.has(c)) {
          throw new StoreError(
            'STORE_CLASS_IN_USE',
            `Class "${c}" has riders (rider ${e.number}), so it can't be removed or renamed. Move its riders to another class first.`,
          );
        }
      }
    }
    const byNumber = new Map(entries.map((e) => [e.number, e]));
    for (const card of this.cards()) {
      const cls = classes.get(byNumber.get(card.number)?.classes[0] ?? '');
      const d = cls?.days.find((x) => x.day === card.day);
      if (!d || card.lap > d.laps) {
        throw new StoreError(
          'STORE_CARD_IN_USE',
          `Rider ${card.number} already has a card for day ${card.day} lap ${card.lap}, so that lap can't be removed.`,
        );
      }
      const scoredTo = card.scores.reduce<number>((n, s, i) => (s === null ? n : i + 1), 0);
      if (scoredTo > d.sections) {
        throw new StoreError(
          'STORE_CARD_IN_USE',
          `Rider ${card.number}'s card for day ${card.day} lap ${card.lap} has scores up to section ${scoredTo}, so this class needs at least ${scoredTo} sections.`,
        );
      }
    }
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

/** Typed text as stored: spaces trimmed and runs of spaces made one. */
function tidyText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function toEntry(r: EntryRow, penalties: PenaltyInput[] | undefined): EntryInput {
  return {
    number: r.number,
    riders: JSON.parse(r.riders_json) as EntryInput['riders'],
    ...(r.club !== null && { club: r.club }),
    ...(r.machine !== null && { machine: r.machine }),
    competitionStatus: r.competition_status,
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
  if (!r.ok) throw new SetupError(r.issues);
  return r.value;
}

/** A valid ISO 8601 time, normalised to UTC. */
function checkTime(value: string): string {
  const t = Date.parse(value);
  if (typeof value !== 'string' || Number.isNaN(t)) {
    throw new StoreError('STORE_BAD_TIME', `"${String(value)}" isn't a time.`);
  }
  return new Date(t).toISOString();
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
