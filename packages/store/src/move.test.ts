import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newEventSetup } from '@tscore/core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { EventLibrary } from './library.js';

// Invented riders only.

const libraries: EventLibrary[] = [];
afterEach(() => {
  while (libraries.length) libraries.pop()!.close();
});

function laptop() {
  const root = mkdtempSync(join(tmpdir(), 'tscore-move-'));
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

function eventWithARider(lib: EventLibrary) {
  const store = lib.create({
    ...newEventSetup('2027-02-06'),
    event: { name: 'Club Trial', code: 'MV1' },
  });
  store.addEntry({
    number: 7,
    riders: [{ givenName: 'Avery', familyName: 'Stone' }],
    competitionStatus: 'competitive',
    status: 'riding',
    classes: ['Trial 1'],
  });
  return store;
}

describe('moving an event to another laptop', () => {
  it('carries the event and its card photos, but not backups or exports', () => {
    const a = laptop();
    const store = eventWithARider(a.lib);
    writeFileSync(join(store.folder, 'cards', '7-1-1.jpg'), 'photo');
    mkdirSync(join(store.folder, 'cards', 'day2'));
    writeFileSync(join(store.folder, 'cards', 'day2', '7-1-2.jpg'), 'photo 2');
    writeFileSync(join(store.folder, 'exports', 'results.pdf'), 'pdf');
    store.backup('manual');
    const file = join(a.root, 'Club Trial.tscore');
    const saved = a.lib.saveForMove(file);
    expect(saved.files).toBe(3);

    const names = Object.keys(unzipSync(readFileSync(file))).sort();
    expect(names).toEqual([
      'cards/7-1-1.jpg',
      'cards/day2/7-1-2.jpg',
      'event.sqlite',
      'manifest.json',
    ]);
    expect(store.auditLog().at(-1)).toMatchObject({
      kind: 'event.move_out',
      detail: { file: 'Club Trial.tscore' },
    });

    const b = laptop();
    const moved = b.lib.openMoved(file);
    expect(moved.folder).toBe(join(b.lib.eventsDir, '2027-02-06 MV1'));
    expect(moved.eventId).toBe(store.eventId);
    expect(moved.entries().map((e) => e.number)).toEqual([7]);
    expect(readFileSync(join(moved.folder, 'cards', 'day2', '7-1-2.jpg'), 'utf8')).toBe('photo 2');
    expect(moved.auditLog().at(-1)).toMatchObject({ kind: 'event.move_in' });
    expect(b.lib.recent()[0]?.folder).toBe(moved.folder);
  });

  it("never overwrites an event that's already on the laptop", () => {
    const a = laptop();
    eventWithARider(a.lib);
    const file = join(a.root, 'copy.tscore');
    a.lib.saveForMove(file);
    const first = a.lib.current!.folder;
    const again = a.lib.openMoved(file);
    expect(again.folder).toBe(`${first} (2)`);
  });

  it('refuses a damaged or incomplete copy, and leaves no folder behind', () => {
    const a = laptop();
    eventWithARider(a.lib);
    const file = join(a.root, 'copy.tscore');
    a.lib.saveForMove(file);
    const entries = unzipSync(readFileSync(file));
    const b = laptop();
    const tryOpen = (zip: Record<string, Uint8Array>) => {
      const bad = join(b.root, 'bad.tscore');
      writeFileSync(bad, zipSync(zip));
      return () => b.lib.openMoved(bad);
    };
    const damaged = expect.objectContaining({ code: 'STORE_DAMAGED' });

    // A changed byte.
    const sqlite = entries['event.sqlite']!.slice();
    sqlite[200] = sqlite[200]! ^ 0xff;
    expect(tryOpen({ ...entries, 'event.sqlite': sqlite })).toThrow(damaged);
    // A missing file.
    const missing = { ...entries };
    delete missing['event.sqlite'];
    expect(tryOpen(missing)).toThrow(damaged);
    // A path that would escape the event folder.
    const manifest = JSON.parse(strFromU8(entries['manifest.json']!)) as {
      files: { path: string }[];
    };
    manifest.files[0]!.path = '../evil.sqlite';
    expect(tryOpen({ ...entries, 'manifest.json': strToU8(JSON.stringify(manifest)) })).toThrow(
      damaged,
    );
    // Not a zip at all.
    const junk = join(b.root, 'junk.tscore');
    writeFileSync(junk, 'not a zip');
    expect(() => b.lib.openMoved(junk)).toThrow(damaged);

    expect(existsSync(b.lib.eventsDir) ? readdirSync(b.lib.eventsDir) : []).toEqual([]);
  });
});
