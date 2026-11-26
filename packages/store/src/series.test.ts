import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SERIES_POINTS, newEventSetup, type EntryInput } from '@tscore/core';
import { afterEach, describe, expect, it } from 'vitest';
import { EventLibrary } from './library.js';
import { deleteSeries, listSeries, readSeriesRound, saveSeries, SERIES_FORMAT } from './series.js';

// Invented riders only.

const libraries: EventLibrary[] = [];
afterEach(() => {
  while (libraries.length) libraries.pop()!.close();
});

function laptop() {
  const root = mkdtempSync(join(tmpdir(), 'tscore-series-'));
  const lib = new EventLibrary({
    settingsDir: join(root, 'settings'),
    eventsDir: join(root, 'Documents', 'tScore'),
    appVersion: '0.0.0-test',
  });
  libraries.push(lib);
  return lib;
}

describe('series on this laptop', () => {
  it('reads a round read-only: provisional until final, then its final results', () => {
    const lib = laptop();
    const store = lib.create({
      ...newEventSetup('2027-02-06'),
      event: { name: 'Winter Round 1', code: 'WR1' },
    });
    const before = readFileSync(join(store.folder, 'event.sqlite'));
    expect(readSeriesRound(store.folder)).toMatchObject({
      name: 'Winter Round 1',
      code: 'WR1',
      date: '2027-02-06',
      state: 'provisional',
    });
    expect(readFileSync(join(store.folder, 'event.sqlite'))).toEqual(before);
    expect(readSeriesRound(join(store.folder, 'gone')).state).toBe('missing');

    const results = { schema: 'tscore.results/1', classes: [] };
    store.markFinal(1, results);
    expect(readSeriesRound(store.folder)).toMatchObject({ state: 'final', revision: 1, results });
    store.reopenResults('A protest was upheld');
    expect(readSeriesRound(store.folder)).toMatchObject({ state: 'reopened', revision: 1 });
    expect(readSeriesRound(store.folder).results).toBeUndefined();
  });

  it('saves, lists and deletes series files, never their events', () => {
    const lib = laptop();
    const store = lib.create({ ...newEventSetup('2027-02-06'), event: { name: 'R1', code: 'R1' } });
    const setup = {
      schema: SERIES_FORMAT,
      name: 'Winter Series 2027',
      rounds: [store.folder],
      rules: { points: DEFAULT_SERIES_POINTS, ties: 'share' as const },
    };
    const file = saveSeries(lib.eventsDir, setup);
    const second = saveSeries(lib.eventsDir, setup);
    expect(second).not.toBe(file);
    expect(listSeries(lib.eventsDir).map((s) => s.setup.name)).toEqual([
      'Winter Series 2027',
      'Winter Series 2027',
    ]);
    saveSeries(lib.eventsDir, { ...setup, name: 'Renamed' }, file);
    expect(listSeries(lib.eventsDir).map((s) => s.setup.name)).toContain('Renamed');
    deleteSeries(lib.eventsDir, file);
    deleteSeries(lib.eventsDir, join(store.folder, 'event.sqlite'));
    expect(existsSync(file)).toBe(false);
    expect(existsSync(join(store.folder, 'event.sqlite'))).toBe(true);
    expect(() => saveSeries(lib.eventsDir, { ...setup, name: '  ' })).toThrow(
      expect.objectContaining({ code: 'STORE_SERIES_NAME' }),
    );
  });
});

describe('a round file with licence numbers (#125)', () => {
  it('reads rider number → licences from the entry list, only with final results', () => {
    const lib = laptop();
    const store = lib.create({ ...newEventSetup('2027-03-06'), event: { name: 'R2', code: 'R2' } });
    const entry = (number: number, riders: EntryInput['riders']): EntryInput => ({
      number,
      riders,
      competitionStatus: 'competitive',
      status: 'riding',
      classes: ['Trial 4'],
    });
    store.addEntry(entry(4, [{ givenName: 'Sam', familyName: 'Stone', licence: 'VT-10442' }]));
    store.addEntry(entry(5, [{ givenName: 'Jo', familyName: 'Park' }]));
    store.addEntry(
      entry(6, [
        { givenName: 'Ash', familyName: 'Moor', licence: 'A1' },
        { givenName: 'Bo', familyName: 'Lake' },
      ]),
    );
    expect(readSeriesRound(store.folder).licences).toBeUndefined();

    const results = { schema: 'tscore.results/1', classes: [] };
    store.markFinal(1, results);
    const round = readSeriesRound(store.folder);
    expect(round.licences).toEqual(
      new Map([
        [4, ['VT-10442']],
        [5, [null]],
        [6, ['A1', null]],
      ]),
    );
    // The final results it read still hold no licence numbers.
    expect(JSON.stringify(round.results)).not.toContain('10442');
  });
});
