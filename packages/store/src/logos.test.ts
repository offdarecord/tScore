import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newEventSetup } from '@tscore/core';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore, LOGO_MAX_SPONSORS } from './event-store.js';

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
