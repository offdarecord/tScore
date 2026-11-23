/** Helpers for the store's tests (and the kill-test child process). Not part of the API. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StoreContext } from './event-store.js';

/** A fresh empty folder under the OS temp folder. */
export function tempFolder(): string {
  return join(mkdtempSync(join(tmpdir(), 'tscore-store-')), 'event');
}

/** A context with a clock that ticks one second per call, so stamps are distinct and ordered. */
export function testContext(extra: Partial<StoreContext> = {}): StoreContext {
  let t = Date.parse('2027-02-06T09:00:00Z');
  return {
    stationId: '00000000-0000-4000-8000-00000000a001',
    appVersion: '0.0.0-test',
    operator: 'Desk 1',
    now: () => new Date((t += 1000)),
    ...extra,
  };
}

/** A small valid event setup: one day, two classes. */
export const SETUP = {
  schema: 'tscore.event_setup/1',
  event: { name: 'Store Test Trial', code: 'STORE' },
  days: [{ day: 1, date: '2027-02-06' }],
  classes: [
    { name: 'Trial 4', order: 40, days: { '1': { sections: 4, laps: 2 } } },
    { name: 'Trial 4 Plus', order: 35, days: { '1': { sections: 4, laps: 2 } } },
  ],
} as const;
