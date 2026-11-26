import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { newEventSetup } from '@tscore/core';
import { afterEach, describe, expect, it } from 'vitest';
import { EVENT_FILE, EventStore, LOGO_MAX_SPONSORS } from './event-store.js';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const stores: EventStore[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

function store() {
  const folder = join(mkdtempSync(join(tmpdir(), 'tscore-logo-')), 'event');
  const s = EventStore.create(
    folder,
    { ...newEventSetup('2027-02-06'), event: { name: 'Club Trial', code: 'LG1' } },
    {
      stationId: 'test',
      appVersion: '0.0.0-test',
    },
  );
  stores.push(s);
  return s;
}

describe('logos', () => {
  it('keeps one event logo (a new one replaces it) and sponsors in the order added', () => {
    const s = store();
    s.addLogo('event', PNG);
    const replaced = s.addLogo('event', JPEG);
    s.addLogo('sponsor', PNG);
    s.addLogo('sponsor', JPEG);
    expect(s.logos().map((l) => [l.role, l.position, l.mime])).toEqual([
      ['event', 1, 'image/jpeg'],
      ['sponsor', 1, 'image/png'],
      ['sponsor', 2, 'image/jpeg'],
    ]);
    expect(s.logoData(replaced.id)).toEqual(JPEG);
    s.removeLogo(s.logos()[1]!.id);
    expect(s.logos().map((l) => l.role)).toEqual(['event', 'sponsor']);
    expect(
      s
        .auditLog()
        .filter((a) => a.kind.startsWith('logo.'))
        .map((a) => a.kind),
    ).toEqual(['logo.add', 'logo.add', 'logo.add', 'logo.add', 'logo.remove']);
  });

  it('takes only PNG or JPEG, by content, up to 1 MB, and up to 8 sponsors', () => {
    const s = store();
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (err) {
        return (err as { code: string }).code;
      }
      return 'none';
    };
    expect(code(() => s.addLogo('event', new TextEncoder().encode('<svg/>')))).toBe(
      'STORE_LOGO_TYPE',
    );
    const big = new Uint8Array(1_000_001);
    big.set(PNG);
    expect(code(() => s.addLogo('event', big))).toBe('STORE_LOGO_SIZE');
    for (let i = 0; i < LOGO_MAX_SPONSORS; i++) s.addLogo('sponsor', PNG);
    expect(code(() => s.addLogo('sponsor', PNG))).toBe('STORE_LOGO_COUNT');
    expect(s.logos()).toHaveLength(LOGO_MAX_SPONSORS);
  });
});

describe('the club logo (#111)', () => {
  it('keeps one club logo beside the event logo, a new one replacing it', () => {
    const s = store();
    s.addLogo('event', PNG);
    s.addLogo('club', PNG);
    const replaced = s.addLogo('club', JPEG);
    expect(s.logos().map((l) => [l.role, l.mime])).toEqual([
      ['club', 'image/jpeg'],
      ['event', 'image/png'],
    ]);
    expect(s.logoData(replaced.id)).toEqual(JPEG);
    expect(s.auditLog().filter((a) => a.kind === 'logo.add')).toHaveLength(3);
  });

  it("keeps an older file's logos when it gains club logos", () => {
    const s = store();
    s.addLogo('event', PNG);
    s.addLogo('sponsor', JPEG);
    const folder = s.folder;
    s.close();
    stores.pop();
    // Put the file back to schema 7: the logo table without 'club'.
    const db = new DatabaseSync(join(folder, EVENT_FILE));
    db.exec(`
      CREATE TABLE logo_old (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('event', 'sponsor')),
        position INTEGER NOT NULL,
        mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg')),
        data BLOB NOT NULL,
        added_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO logo_old SELECT * FROM logo;
      DROP TABLE logo;
      ALTER TABLE logo_old RENAME TO logo;
      PRAGMA user_version = 7;
    `);
    db.close();
    const reopened = EventStore.open(folder, { stationId: 'test', appVersion: '0.0.0-test' });
    stores.push(reopened);
    expect(reopened.logos().map((l) => l.role)).toEqual(['event', 'sponsor']);
    reopened.addLogo('club', PNG);
    expect(reopened.logos().map((l) => l.role)).toEqual(['club', 'event', 'sponsor']);
  });
});
