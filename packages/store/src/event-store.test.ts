import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { computeResults, DEFAULT_SCORING, type EntryInput, type EventInput } from '@tscore/core';
import { afterEach, describe, expect, it } from 'vitest';
import { NewerFileError, SetupError, StoreError } from './errors.js';
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
  competitionStatus: 'competitive',
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

describe('changing the setup', () => {
  const withRider = () => {
    const store = newEvent();
    store.addEntry(rider(7));
    return store;
  };
  const setupWith = (trial4: { sections: number; laps: number } | null) => ({
    ...SETUP,
    classes: [
      ...(trial4 ? [{ name: 'Trial 4', order: 40, days: { '1': trial4 } }] : []),
      SETUP.classes[1],
    ],
  });

  it('allows changes after riders and cards exist, and logs them', () => {
    const store = withRider();
    store.recordCard({ number: 7, day: 1, lap: 1, scores: [0, 1, 2, 3], source: 'scan' });
    store.updateSetup(setupWith({ sections: 6, laps: 3 }));
    expect(store.setup.classes[0]!.days['1']).toEqual({ sections: 6, laps: 3 });
    expect(store.auditLog().at(-1)!.kind).toBe('setup.update');
  });

  it('refuses to remove a class that has riders', () => {
    const store = withRider();
    expect(code(() => store.updateSetup(setupWith(null)))).toBe('STORE_CLASS_IN_USE');
  });

  it('refuses to remove a lap or sections that already have scores', () => {
    const store = withRider();
    store.recordCard({ number: 7, day: 1, lap: 2, scores: [0, 1, 2, 3], source: 'scan' });
    expect(code(() => store.updateSetup(setupWith({ sections: 4, laps: 1 })))).toBe(
      'STORE_CARD_IN_USE',
    );
    expect(code(() => store.updateSetup(setupWith({ sections: 3, laps: 2 })))).toBe(
      'STORE_CARD_IN_USE',
    );
    expect(store.setup.classes[0]!.days['1']).toEqual({ sections: 4, laps: 2 });
  });

  it('lists every problem with an invalid setup', () => {
    const store = newEvent();
    try {
      store.updateSetup({ ...SETUP, event: { name: '', code: 'x' } });
      expect.unreachable();
    } catch (err) {
      expect((err as SetupError).issues.map((i) => i.path)).toEqual(['event.name', 'event.code']);
    }
  });
});

describe('riders', () => {
  it('adds riders, and refuses a duplicate number or an unknown class', () => {
    const store = newEvent();
    store.addEntry(rider(1));
    store.addEntry(rider(2, { club: 'Example MCC', competitionStatus: 'no_award' }));
    expect(store.entries().map((e) => [e.number, e.competitionStatus, e.club ?? null])).toEqual([
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

  it('corrects a name, club and machine, keeping the number, licence and cards', () => {
    const store = newEvent();
    store.addEntry(
      rider(14, {
        riders: [{ givenName: 'Avrey', familyName: 'stone', licence: '123456' }],
        machine: 'Beta Evo 300',
      }),
    );
    store.recordCard({ number: 14, day: 1, lap: 1, scores: [0, 1, 2, 3], source: 'scan' });
    store.renameRiders(14, [{ givenName: ' Avery ', familyName: 'Stone' }]);
    store.setClub(14, 'Example  MCC');
    store.setMachine(14, 'Montesa 4Ride');
    expect(store.entry(14)).toMatchObject({
      number: 14,
      riders: [{ givenName: 'Avery', familyName: 'Stone', licence: '123456' }],
      club: 'Example MCC',
      machine: 'Montesa 4Ride',
    });
    expect(store.cardLog().map((c) => c.number)).toEqual([14]);
    const log = store.auditLog().filter((a) => a.subject === 'rider 14');
    expect(log.slice(-3).map((a) => [a.kind, a.detail])).toEqual([
      [
        'entry.names',
        {
          from: [{ givenName: 'Avrey', familyName: 'stone' }],
          to: [{ givenName: 'Avery', familyName: 'Stone' }],
        },
      ],
      ['entry.club', { from: null, to: 'Example MCC' }],
      ['entry.machine', { from: 'Beta Evo 300', to: 'Montesa 4Ride' }],
    ]);
  });

  it('clears a club or machine, and refuses an empty name or the wrong number of names', () => {
    const store = newEvent();
    store.addEntry(rider(3, { club: 'Example MCC', machine: 'Beta Evo 300' }));
    store.setClub(3, '  ');
    store.setMachine(3, null);
    expect(store.entry(3).club).toBeUndefined();
    expect(store.entry(3).machine).toBeUndefined();
    expect(code(() => store.renameRiders(3, [{ givenName: ' ', familyName: '' }]))).toBe(
      'STORE_BAD_NAME',
    );
    expect(
      code(() =>
        store.renameRiders(3, [
          { givenName: 'A', familyName: 'B' },
          { givenName: 'C', familyName: 'D' },
        ]),
      ),
    ).toBe('STORE_BAD_NAME');
    expect(code(() => store.setMachine(3, 'x'.repeat(61)))).toBe('STORE_BAD_MACHINE');
    expect(code(() => store.renameRiders(99, [{ givenName: 'A', familyName: 'B' }]))).toBe(
      'STORE_NO_RIDER',
    );
  });

  it('renames a sidecar driver and passenger together', () => {
    const store = newEvent();
    store.addEntry(
      rider(50, {
        riders: [
          { givenName: 'Drew', familyName: 'Driver' },
          { givenName: 'Pat', familyName: 'Pasenger' },
        ],
      }),
    );
    store.renameRiders(50, [
      { givenName: 'Drew', familyName: 'Driver' },
      { givenName: 'Pat', familyName: 'Passenger' },
    ]);
    expect(store.entry(50).riders.map((p) => p.familyName)).toEqual(['Driver', 'Passenger']);
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

  it('records when the card was handed in, and lists cards newest first', () => {
    const store = withRider();
    store.addEntry(rider(2));
    store.recordCard({ number: 1, day: 1, lap: 1, scores: [0, 1, 0, 0], source: 'scan' });
    store.recordCard({
      number: 2,
      day: 1,
      lap: 1,
      scores: [5, 0, 0, 0],
      source: 'manual',
      receivedAt: '2027-02-06T08:30:00+10:00',
    });
    const log = store.cardLog();
    expect(log.map((c) => [c.number, c.source, c.edited, c.scores])).toEqual([
      [2, 'manual', false, [5, 0, 0, 0]],
      [1, 'scan', false, [0, 1, 0, 0]],
    ]);
    expect(log[0]!.receivedAt).toBe('2027-02-05T22:30:00.000Z');
    expect(log[1]!.receivedAt).toMatch(/^2027-02-06T09:00:\d\d\.000Z$/);
    expect(
      code(() =>
        store.recordCard({
          number: 1,
          day: 1,
          lap: 2,
          scores: [0, 0, 0, 0],
          source: 'manual',
          receivedAt: 'half past ten',
        }),
      ),
    ).toBe('STORE_BAD_TIME');
  });

  it('edits a whole card at once, versioning only the sections that change', () => {
    const store = withRider();
    store.recordCard({ number: 1, day: 1, lap: 1, scores: [0, 1, 0, 0], source: 'manual' });
    const card = { number: 1, day: 1, lap: 1, source: 'amend' } as const;
    expect(store.amendCard({ ...card, scores: [0, 1, 0, 0] })).toBe(0);
    expect(store.amendCard({ ...card, scores: [0, 2, 0, 5] })).toBe(2);
    expect(store.cards()[0]!.scores).toEqual([0, 2, 0, 5]);
    expect(store.scoreHistory(1, 1, 1, 1)).toHaveLength(1);
    expect(store.scoreHistory(1, 1, 1, 2).map((v) => [v.value, v.source])).toEqual([
      [1, 'manual'],
      [2, 'amend'],
    ]);
    expect(store.cardLog()[0]).toMatchObject({ source: 'manual', edited: true });
    expect(store.auditLog().find((a) => a.kind === 'card.amend')?.detail).toEqual({
      changes: [
        { section: 2, from: 1, to: 2 },
        { section: 4, from: 0, to: 5 },
      ],
      source: 'amend',
    });
    expect(code(() => store.amendCard({ ...card, scores: [0, 0, 0] }))).toBe(
      'STORE_WRONG_SECTION_COUNT',
    );
    expect(code(() => store.amendCard({ ...card, scores: [0, 4, 0, 0] }))).toBe('STORE_BAD_SCORE');
    expect(code(() => store.amendCard({ ...card, lap: 2, scores: [0, 0, 0, 0] }))).toBe(
      'STORE_NO_CARD',
    );
  });

  it('opens a file saved before hand-in times were kept, using when each card was saved', () => {
    const first = EventStore.create(tempFolder(), SETUP, testContext());
    first.addEntry(rider(1));
    first.recordCard({ number: 1, day: 1, lap: 1, scores: [0, 0, 0, 0], source: 'scan' });
    const saved = first.cardLog()[0]!.receivedAt;
    const folder = first.folder;
    first.close();
    const db = new DatabaseSync(join(folder, EVENT_FILE));
    db.exec(
      'DROP TABLE logo; DROP TABLE results_final; ALTER TABLE entry DROP COLUMN machine; ALTER TABLE entry RENAME COLUMN competition_status TO tier; DROP TABLE label_print; ALTER TABLE card DROP COLUMN received_at; PRAGMA user_version = 1',
    );
    db.close();
    const store = track(EventStore.open(folder, testContext()));
    expect(store.cardLog()[0]!.receivedAt).toBe(saved);
    expect(store.entries()[0]!.competitionStatus).toBe('competitive');
    expect(
      readdirSync(join(folder, 'backups')).some((f) => f.includes('before-upgrade-from-v1')),
    ).toBe(true);
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
    expect(store.penaltyList()).toEqual([
      expect.objectContaining({ id, number: 1, points: 5, reason: 'time', note: '6 min late' }),
    ]);
    store.removePenalty(id);
    expect(store.penaltyList()).toEqual([]);
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
    // Every card is saved in its own transaction, as at the desk, so a slow CI disk can take
    // several seconds (6.9 s seen on 24 Nov 2026, against the 5 s default).
  }, 30_000);

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
  }, 30_000);
});

describe('card labels', () => {
  it('remembers which labels were printed, and logs each print', () => {
    const store = newEvent();
    expect(store.printedLabels()).toEqual([]);
    store.recordLabelsPrinted(
      [
        { number: 2, day: 1, lap: 1 },
        { number: 1, day: 1, lap: 2 },
        { number: 1, day: 1, lap: 1 },
      ],
      'all',
    );
    store.recordLabelsPrinted([{ number: 1, day: 1, lap: 1 }], 'rider 1');
    store.recordLabelsPrinted([], 'nothing');
    expect(store.printedLabels()).toEqual([
      { number: 1, day: 1, lap: 1 },
      { number: 1, day: 1, lap: 2 },
      { number: 2, day: 1, lap: 1 },
    ]);
    const prints = store.auditLog().filter((a) => a.kind === 'labels.print');
    expect(prints.map((a) => a.detail)).toEqual([
      { what: 'all', labels: 3, riders: 2 },
      { what: 'rider 1', labels: 1, riders: 1 },
    ]);
  });
});

describe('results marked final', () => {
  const finalEvent = () => {
    const store = newEvent();
    store.addEntry(rider(1));
    store.recordCard({ number: 1, day: 1, lap: 1, scores: [0, 0, 0, 0], source: 'scan' });
    return store;
  };

  it('keeps each revision as declared, and refuses changes until reopened with a reason', () => {
    const store = finalEvent();
    expect(store.finalState()).toBeNull();
    expect(store.nextRevision()).toBe(1);
    store.markFinal(1, { status: 'final', revision: 1, marker: 'first' });
    expect(store.finalState()).toMatchObject({ revision: 1, reopened: false });

    // Nothing that affects results can change while they're final.
    expect(
      code(() =>
        store.recordCard({ number: 1, day: 1, lap: 2, scores: [0, 0, 0, 0], source: 'scan' }),
      ),
    ).toBe('STORE_RESULTS_FINAL');
    expect(code(() => store.addPenalty(1, { points: 5, reason: 'time' }))).toBe(
      'STORE_RESULTS_FINAL',
    );
    expect(code(() => store.setStatus(1, 'dnf'))).toBe('STORE_RESULTS_FINAL');
    expect(code(() => store.addEntry(rider(2)))).toBe('STORE_RESULTS_FINAL');
    expect(code(() => store.markFinal(2, {}))).toBe('STORE_RESULTS_FINAL');
    // The machine and card labels don't affect results.
    store.setMachine(1, 'Example 250');
    store.recordLabelsPrinted([{ number: 1, day: 1, lap: 1 }], 'rider 1');

    expect(code(() => store.reopenResults('  '))).toBe('STORE_NEED_REASON');
    store.reopenResults('Rider 1, section 2 lap 1 misread');
    expect(store.finalState()).toMatchObject({
      revision: 1,
      reopened: true,
      reopenReason: 'Rider 1, section 2 lap 1 misread',
    });
    store.setStatus(1, 'dnf');
    expect(code(() => store.markFinal(3, {}))).toBe('STORE_REVISION_CHANGED');
    store.markFinal(2, { status: 'final', revision: 2 });
    expect(store.finalHistory().map((f) => [f.revision, f.reopened])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(store.finalResults(1)).toEqual({ status: 'final', revision: 1, marker: 'first' });
    expect(store.auditLog().map((a) => a.kind)).toEqual(
      expect.arrayContaining(['results.final', 'results.reopen']),
    );
  });

  it('keeps final results across closing and reopening the event file', () => {
    const store = finalEvent();
    store.markFinal(1, { revision: 1 });
    const folder = store.folder;
    store.close();
    open.splice(open.indexOf(store), 1);
    const again = track(EventStore.open(folder, testContext()));
    expect(again.finalState()?.revision).toBe(1);
    expect(code(() => again.setStatus(1, 'dns'))).toBe('STORE_RESULTS_FINAL');
  });
});
