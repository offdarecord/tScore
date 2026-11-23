import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newEventSetup } from '@tscore/core';
import { afterEach, describe, expect, it } from 'vitest';
import { SetupError, type StoreError } from './errors.js';
import { EVENT_FILE } from './event-store.js';
import { EventLibrary } from './library.js';

const libraries: EventLibrary[] = [];
afterEach(() => {
  while (libraries.length) libraries.pop()!.close();
});

function library(root = mkdtempSync(join(tmpdir(), 'tscore-lib-'))) {
  let t = Date.parse('2027-02-01T09:00:00Z');
  const lib = new EventLibrary({
    settingsDir: join(root, 'settings'),
    eventsDir: join(root, 'Documents', 'tScore'),
    appVersion: '0.0.0-test',
    now: () => new Date((t += 60_000)),
  });
  libraries.push(lib);
  return { lib, root };
}

const setup = (code: string, date = '2027-02-06') => ({
  ...newEventSetup(date),
  event: { name: `Club Trial ${code}`, code },
});

describe('the event library', () => {
  it('makes each new event a dated folder under the events folder, and opens it', () => {
    const { lib } = library();
    const store = lib.create(setup('CT1'));
    expect(store.folder).toBe(join(lib.eventsDir, '2027-02-06 CT1'));
    expect(existsSync(join(store.folder, EVENT_FILE))).toBe(true);
    expect(lib.current).toBe(store);
  });

  it('never reuses a folder: a second event with the same date and code gets its own', () => {
    const { lib } = library();
    const first = lib.create(setup('CT1')).folder;
    const second = lib.create(setup('CT1')).folder;
    expect(second).toBe(`${first} (2)`);
  });

  it('lists recent events newest first, without opening them', () => {
    const { lib } = library();
    lib.create(setup('A1', '2027-01-01'));
    lib.create(setup('B2', '2027-02-02'));
    expect(lib.recent().map((r) => [r.code, r.date, r.days, r.missing])).toEqual([
      ['B2', '2027-02-02', 1, false],
      ['A1', '2027-01-01', 1, false],
    ]);
  });

  it('keeps one open event at a time, moving it to the top of the list when opened', () => {
    const { lib } = library();
    const a = lib.create(setup('A1')).folder;
    lib.create(setup('B2'));
    const reopened = lib.open(a);
    expect(lib.current).toBe(reopened);
    expect(lib.recent()[0]!.code).toBe('A1');
  });

  it('refreshes the list when the setup changes', () => {
    const { lib } = library();
    lib.create(setup('A1'));
    lib.updateSetup({ ...lib.current!.setup, event: { name: 'Renamed Trial', code: 'RT1' } });
    expect(lib.recent()[0]).toMatchObject({ name: 'Renamed Trial', code: 'RT1' });
  });

  it('marks an event whose folder has gone, and can forget it', () => {
    const { lib } = library();
    const folder = lib.create(setup('A1')).folder;
    lib.close();
    rmSync(folder, { recursive: true });
    expect(lib.recent()[0]!.missing).toBe(true);
    lib.forget(folder);
    expect(lib.recent()).toEqual([]);
  });

  it('refuses an invalid setup with every problem listed, and makes no folder', () => {
    const { lib } = library();
    try {
      lib.create({ ...newEventSetup('2027-02-06'), event: { name: '', code: '' } });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(SetupError);
      expect((err as SetupError).issues.length).toBeGreaterThanOrEqual(2);
    }
    expect(existsSync(lib.eventsDir)).toBe(false);
    expect(lib.current).toBeNull();
  });

  it('says plainly when a folder has no event in it', () => {
    const { lib, root } = library();
    try {
      lib.open(root);
      expect.unreachable();
    } catch (err) {
      expect((err as StoreError).code).toBe('STORE_NOT_AN_EVENT');
    }
  });

  it('keeps the same station id across restarts', () => {
    const { lib, root } = library();
    const id = lib.stationId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(library(root).lib.stationId()).toBe(id);
  });

  it('shrugs off a damaged settings file rather than refusing to start', () => {
    const { lib, root } = library();
    lib.create(setup('A1'));
    writeFileSync(join(root, 'settings', 'recent-events.json'), '{ not json');
    expect(lib.recent()).toEqual([]);
    lib.create(setup('B2'));
    expect(
      JSON.parse(readFileSync(join(root, 'settings', 'recent-events.json'), 'utf8')),
    ).toMatchObject({
      events: [{ code: 'B2' }],
    });
  });
});
