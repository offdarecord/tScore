import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newEventSetup } from '@tscore/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreError } from './errors.js';
import { EventStore } from './event-store.js';
import { EventLibrary } from './library.js';
import { SCANS_REMOVED } from './manage.js';

// Invented events only.

const libraries: EventLibrary[] = [];
afterEach(() => {
  while (libraries.length) libraries.pop()!.close();
});

function library() {
  const root = mkdtempSync(join(tmpdir(), 'tscore-manage-'));
  let t = Date.parse('2027-04-01T09:00:00Z');
  const lib = new EventLibrary({
    settingsDir: join(root, 'settings'),
    eventsDir: join(root, 'Documents', 'tScore'),
    appVersion: '0.0.0-test',
    now: () => new Date((t += 60_000)),
  });
  libraries.push(lib);
  return { lib, root };
}

const setup = (code: string, date: string) => ({
  ...newEventSetup(date),
  event: { name: `Example Trial ${code}`, code },
});

/** An event with two big "card photos" and one already small. */
function eventWithPhotos(lib: EventLibrary, code: string, date: string): string {
  const folder = lib.create(setup(code, date)).folder;
  lib.close();
  mkdirSync(join(folder, 'cards'), { recursive: true });
  writeFileSync(join(folder, 'cards', 'r1-d1-l1.jpg'), Buffer.alloc(200_000, 1));
  writeFileSync(join(folder, 'cards', 'r2-d1-l1.jpg'), Buffer.alloc(150_000, 2));
  writeFileSync(join(folder, 'cards', 'r3-d1-l1.jpg'), Buffer.alloc(10_000, 3));
  return folder;
}

const shrink = () => new Uint8Array(5_000);

describe('Manage events', () => {
  it('lists every event folder with its sizes, newest first, including ones off the recent list', () => {
    const { lib } = library();
    const a = eventWithPhotos(lib, 'AAA', '2027-01-10');
    eventWithPhotos(lib, 'BBB', '2027-02-14');
    lib.forget(a);
    const list = lib.manageList();
    expect(list.map((e) => e.code)).toEqual(['BBB', 'AAA']);
    const aaa = list.find((e) => e.code === 'AAA')!;
    expect(aaa).toMatchObject({ name: 'Example Trial AAA', firstDate: '2027-01-10', final: false });
    expect(aaa.cardFiles).toBe(3);
    expect(aaa.cardBytes).toBe(360_000);
    expect(aaa.otherBytes).toBeGreaterThan(0);
  });

  it('shrinks full-size card photos, keeps small ones, and records it in the audit log', () => {
    const { lib } = library();
    const folder = eventWithPhotos(lib, 'AAA', '2027-01-10');
    const r = lib.removeCardScans(folder, shrink);
    expect(r).toEqual({ images: 2, bytesFreed: 350_000 - 10_000 });
    expect(statSync(join(folder, 'cards', 'r1-d1-l1.jpg')).size).toBe(5_000);
    expect(statSync(join(folder, 'cards', 'r3-d1-l1.jpg')).size).toBe(10_000);
    const info = lib.manageList()[0]!;
    expect(info.cardBytes).toBe(20_000);
    expect(info.scansRemovedAt).toBeDefined();
    const store = EventStore.open(folder, lib.context());
    try {
      const entry = store.auditLog().find((e) => e.kind === SCANS_REMOVED);
      expect(entry?.detail).toEqual({ images: 2, bytesFreed: 340_000 });
    } finally {
      store.close();
    }
    // The event still opens, with its scores.
    expect(lib.open(folder).setup.event.code).toBe('AAA');
  });

  it("won't tidy the open event, or a folder that isn't an event", () => {
    const { lib, root } = library();
    const folder = eventWithPhotos(lib, 'AAA', '2027-01-10');
    lib.open(folder);
    expect(() => lib.removeCardScans(folder, shrink)).toThrow(
      expect.objectContaining({ code: 'STORE_EVENT_OPEN' }) as StoreError,
    );
    expect(() => lib.checkDelete(folder, 'AAA')).toThrow(
      expect.objectContaining({ code: 'STORE_EVENT_OPEN' }) as StoreError,
    );
    expect(() => lib.removeCardScans(join(root, 'elsewhere'), shrink)).toThrow(
      expect.objectContaining({ code: 'STORE_NOT_MANAGED' }) as StoreError,
    );
    expect(readFileSync(join(folder, 'cards', 'r1-d1-l1.jpg')).length).toBe(200_000);
  });

  it('allows a delete only when the event code is typed', () => {
    const { lib } = library();
    const folder = eventWithPhotos(lib, 'AAA', '2027-01-10');
    expect(() => lib.checkDelete(folder, 'BBB')).toThrow(
      expect.objectContaining({ code: 'STORE_CONFIRM_CODE' }) as StoreError,
    );
    expect(lib.checkDelete(folder, ' aaa ').code).toBe('AAA');
  });

  it('saves a copy of a closed event before it goes', () => {
    const { lib, root } = library();
    const folder = eventWithPhotos(lib, 'AAA', '2027-01-10');
    const r = lib.saveCopyOf(folder, join(root, 'AAA.tscore'));
    expect(r.files).toBeGreaterThan(3);
    expect(lib.current).toBeNull();
  });

  it('remembers Keep and Remind me later on this laptop', () => {
    const { lib } = library();
    const folder = eventWithPhotos(lib, 'AAA', '2027-01-10');
    lib.keepEvent(folder);
    lib.keepEvent(folder);
    lib.remindLater(30);
    const prefs = lib.tidyPrefs();
    expect(prefs.keep).toHaveLength(1);
    expect(Date.parse(prefs.remindAfter!)).toBeGreaterThan(Date.parse('2027-04-30T00:00:00Z'));
  });
});
