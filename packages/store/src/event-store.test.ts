import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { computeResults, DEFAULT_SCORING, type EntryInput, type EventInput } from '@tscore/core';
import { afterEach, describe, expect, it } from 'vitest';
import { NewerFileError, StoreError } from './errors.js';
import { EVENT_FILE, EventStore } from './event-store.js';
import { SCHEMA_VERSION } from './migrations.js';
import { SETUP, tempFolder, testContext } from './test-support.js';

const open: EventStore[] = [];
afterEach(() => {
  while (open.length) open.pop()!.close();
});
const track = (s: EventStore) => (open.push(s), s);
const newEvent = () => track(EventStore.create(tempFolder(), SETUP, testContext()));

const rider = (number: number, extra: Partial<EntryInput> = {}): EntryInput => ({
  number,
  riders: [{ givenName: 'Rider', familyName: String(number) }],
  tier: 'competitive',
  status: 'riding',
  classes: ['Trial 4'],
  ...extra,
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as StoreError).code;
  }
  return 'no error';
};

describe('creating and opening an event', () => {
  it('makes the event folder and reopens it with the same setup', () => {
    const store = newEvent();
    const { folder, eventId } = store;
    store.close();
    open.pop();
    expect(readdirSync(folder).sort()).toEqual(['backups', 'cards', EVENT_FILE, 'exports'].sort());
    const again = track(EventStore.open(folder, testContext()));
    expect(again.eventId).toBe(eventId);
    expect(again.setup.event).toMatchObject({
      name: 'Store Test Trial',
      code: 'STORE',
      id: eventId,
    });
  });

  it('saves in WAL mode, so a committed change survives a crash', () => {
    const store = newEvent();
    const db = new DatabaseSync(join(store.folder, EVENT_FILE));
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: SCHEMA_VERSION });
    db.close();
  });

  it('refuses a folder that already has files in it', () => {
    const folder = newEvent().folder;
    expect(code(() => EventStore.create(folder, SETUP, testContext()))).toBe(
      'STORE_FOLDER_NOT_EMPTY',
    );
  });

  it('refuses an invalid setup, saying what is wrong', () => {
    expect(() => EventStore.create(tempFolder(), { ...SETUP, classes: [] }, testContext())).toThrow(
      /event setup isn't valid/,
    );
  });

  it('refuses a folder with no event in it', () => {
    expect(code(() => EventStore.open(tempFolder(), testContext()))).toBe('STORE_NOT_AN_EVENT');
  });

  it('refuses a file saved by a newer tScore, and leaves it untouched', () => {
    const store = newEvent();
    const folder = store.folder;
    store.close();
    open.pop();
    const db = new DatabaseSync(join(folder, EVENT_FILE));
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    db.close();
    expect(() => EventStore.open(folder, testContext())).toThrow(NewerFileError);
    const check = new DatabaseSync(join(folder, EVENT_FILE));
    expect(check.prepare('PRAGMA user_version').get()).toEqual({
      user_version: SCHEMA_VERSION + 1,
    });
    check.close();
  });

  it('refuses a file that is not a tScore event', () => {
    const folder = tempFolder();
    EventStore.create(folder, SETUP, testContext()).close();
    writeFileSync(join(folder, EVENT_FILE), 'not a database at all, just some text '.repeat(200));
    expect(() => EventStore.open(folder, testContext())).toThrow();
  });
});

describe('riders', () => {
  it('adds riders, and refuses a duplicate number or an unknown class', () => {
    const store = newEvent();
    store.addEntry(rider(1));
    store.addEntry(rider(2, { club: 'Example MCC', tier: 'no_award' }));
    expect(store.entries().map((e) => [e.number, e.tier, e.club ?? null])).toEqual([
      [1, 'competitive', null],
      [2, 'no_award', 'Example MCC'],
    ]);
    expect(code(() => store.addEntry(rider(1)))).toBe('STORE_DUPLICATE_RIDER');
    expect(code(() => store.addEntry(rider(3, { classes: ['Nope'] })))).toBe('STORE_NO_CLASS');
  });

  it('moves a rider to another class and marks DNF, recording both in the audit log', () => {
    const store = newEvent();
    store.addEntry(rider(7, { classes: ['Trial 4 Plus'] }));
    store.changeClasses(7, ['Trial 4']);
    store.setStatus(7, 'dnf');
    expect(store.entry(7)).toMatchObject({ classes: ['Trial 4'], status: 'dnf' });
    const log = store.auditLog().filter((a) => a.subject === 'rider 7');
    expect(log.map((a) => [a.kind, a.detail])).toEqual([
      ['entry.add', expect.objectContaining({ number: 7 })],
      ['entry.classes', { from: ['Trial 4 Plus'], to: ['Trial 4'] }],
      ['entry.status', { from: 'riding', to: 'dnf' }],
    ]);
    expect(log.every((a) => a.operator === 'Desk 1')).toBe(true);
  });
});

describe('cards and scores', () => {
  const withRider = () => {
    const store = newEvent();
    store.addEntry(rider(1));
    return store;
  };

  it('records a card and reads it back', () => {
    const store = withRider();
    store.recordCard({ number: 1, day: 1, lap: 1, scores: [0, 1, 5, null], source: 'scan' });
    expect(store.cards()).toEqual([{ number: 1, day: 1, lap: 1, scores: [0, 1, 5, null] }]);
  });

  it('refuses a card that does not fit the event', () => {
    const store = withRider();
    const card = { number: 1, day: 1, lap: 1, scores: [0, 0, 0, 0], source: 'scan' } as const;
    expect(code(() => store.recordCard({ ...card, scores: [0, 0, 0] }))).toBe(
      'STORE_WRONG_SECTION_COUNT',
    );
    expect(code(() => store.recordCard({ ...card, scores: [0, 4, 0, 0] }))).toBe('STORE_BAD_SCORE');
    expect(code(() => store.recordCard({ ...card, lap: 3 }))).toBe('STORE_NO_LAP');
    expect(code(() => store.recordCard({ ...card, day: 2 }))).toBe('STORE_NO_DAY');
    expect(code(() => store.recordCard({ ...card, number: 99 }))).toBe('STORE_NO_RIDER');
    store.recordCard(card);
    expect(code(() => store.recordCard(card))).toBe('STORE_DUPLICATE_CARD');
    expect(store.cards()).toHaveLength(1);
  });

  it('keeps every version of a corrected score, with no reason required', () => {
    const store = withRider();
    store.recordCard({
      number: 1,
      day: 1,
      lap: 1,
      scores: [0, 3, 0, 0],
      source: 'scan',
      confidence: [0.99, 0.41, 0.98, 0.97],
    });
    store.correctScore({ number: 1, day: 1, lap: 1, section: 2, value: 2, source: 'review' });
    store.correctScore({
      number: 1,
      day: 1,
      lap: 1,
      section: 2,
      value: 5,
      source: 'amend',
      reason: 'Observer confirmed',
    });
    expect(store.cards()[0]!.scores).toEqual([0, 5, 0, 0]);
    const history = store.scoreHistory(1, 1, 1, 2);
    expect(history.map((v) => [v.value, v.source, v.confidence, v.reason])).toEqual([
      [3, 'scan', 0.41, null],
      [2, 'review', null, null],
      [5, 'amend', null, 'Observer confirmed'],
    ]);
    expect(history[0]!.supersededBy).toBe(history[1]!.id);
    expect(history[1]!.supersededBy).toBe(history[2]!.id);
    expect(history[2]!.supersededBy).toBeNull();
    expect(
      store
        .auditLog()
        .filter((a) => a.kind === 'score.correct')
        .map((a) => a.detail),
    ).toEqual([
      { from: 3, to: 2, source: 'review' },
      { from: 2, to: 5, source: 'amend', reason: 'Observer confirmed' },
    ]);
  });

  it('does nothing when a correction does not change the score', () => {
    const store = withRider();
    store.recordCard({ number: 1, day: 1, lap: 1, scores: [0, 0, 0, 0], source: 'scan' });
    store.correctScore({ number: 1, day: 1, lap: 1, section: 1, value: 0, source: 'review' });
    expect(store.scoreHistory(1, 1, 1, 1)).toHaveLength(1);
  });

  it('cannot change or delete score history or the audit log, even with SQL', () => {
    const store = withRider();
    store.recordCard({ number: 1, day: 1, lap: 1, scores: [0, 0, 0, 0], source: 'scan' });
    const db = new DatabaseSync(join(store.folder, EVENT_FILE));
    expect(() => db.exec('UPDATE score_version SET value = 5')).toThrow(/append-only/);
    expect(() => db.exec('DELETE FROM score_version')).toThrow(/append-only/);
    expect(() => db.exec("UPDATE audit_event SET kind = 'x'")).toThrow(/append-only/);
    expect(() => db.exec('DELETE FROM audit_event')).toThrow(/append-only/);
    db.close();
  });
});

describe('penalties', () => {
  it('adds and removes penalties, which reach the results input', () => {
    const store = newEvent();
    store.addEntry(rider(1));
    const id = store.addPenalty(1, { points: 5, reason: 'time', note: '6 min late' });
    expect(store.entry(1).penalties).toEqual([{ points: 5, reason: 'time', note: '6 min late' }]);
    store.removePenalty(id);
    expect(store.entry(1).penalties).toBeUndefined();
    expect(code(() => store.removePenalty(id))).toBe('STORE_NO_PENALTY');
    expect(store.auditLog().map((a) => a.kind)).toContain('penalty.remove');
  });
});

describe('results', () => {
  it('gives the results engine exactly what it would get from the cards directly (golden event)', () => {
    // A real club event (anonymised), loaded into the store the way the app will: setup,
    // riders, then every card.
    const fixture = JSON.parse(
      readFileSync(new URL('../../../fixtures/golden/G9.json', import.meta.url), 'utf8'),
    ) as { event: Omit<EventInput, 'scoring'> };
    const ev = fixture.event;
    const setup = {
      schema: 'tscore.event_setup/1',
      event: { id: ev.id, name: ev.name, code: ev.code },
      days: ev.days,
      classes: ev.classes.map((c) => ({
        name: c.name,
        order: c.order,
        scored: c.scored,
        days: Object.fromEntries(
          c.days.map((d) => [String(d.day), { sections: d.sections, laps: d.laps }]),
        ),
      })),
    };
    const store = track(EventStore.create(tempFolder(), setup, testContext()));
    for (const e of ev.entries) store.addEntry(e);
    for (const c of ev.cards) store.recordCard({ ...c, source: 'import' });

    const options = {
      generator: { name: 'tScore', version: 'test' },
      generatedAt: '2027-02-06T17:00:00+11:00',
      status: 'provisional' as const,
      revision: 1,
    };
    const direct = computeResults({ ...ev, scoring: DEFAULT_SCORING }, options);
    const viaStore = computeResults(store.resultsInput(), options);
    expect(viaStore).toEqual(direct);
  });

  it('asks for the date of each day before working out results', () => {
    const store = track(
      EventStore.create(tempFolder(), { ...SETUP, days: [{ day: 1 }] }, testContext()),
    );
    expect(code(() => store.resultsInput())).toBe('STORE_NO_DATE');
  });
});

describe('backups', () => {
  it('saves a consistent copy that opens as the same event', () => {
    const store = newEvent();
    store.addEntry(rider(1));
    store.recordCard({ number: 1, day: 1, lap: 1, scores: [0, 1, 2, 3], source: 'scan' });
    const path = store.backup('before-results');
    expect(existsSync(path)).toBe(true);
    const copy = new DatabaseSync(path);
    expect(copy.prepare('SELECT count(*) AS n FROM score_version').get()).toEqual({ n: 4 });
    expect(copy.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
    copy.close();
  });

  it('keeps only the newest automatic backups', () => {
    const store = newEvent();
    for (let i = 0; i < 5; i++) store.backup('auto', 3);
    store.backup('named');
    const files = readdirSync(join(store.folder, 'backups'));
    expect(files.filter((f) => f.endsWith('-auto.sqlite'))).toHaveLength(3);
    expect(files.filter((f) => f.endsWith('-named.sqlite'))).toHaveLength(1);
  });
});
