/**
 * Child process for the kill test (kill.test.ts). Opens the event in argv[2] and records cards
 * as fast as it can, printing "saved <n>" after each commit, until it's killed.
 */
import { EventStore } from './event-store.js';
import { testContext } from './test-support.js';

const store = EventStore.open(process.argv[2] ?? '', testContext());
let saved = 0;
for (const e of store.entries()) {
  for (const lap of [1, 2]) {
    store.recordCard({ number: e.number, day: 1, lap, scores: [0, 1, 2, 3], source: 'scan' });
    saved += 1;
    process.stdout.write(`saved ${saved}\n`);
  }
}
store.close();
