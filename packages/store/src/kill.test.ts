/**
 * Kill test (ADR 0005/0006): a confirmed card must survive the process dying at any moment.
 *
 * A child process records cards as fast as it can and reports each commit; we kill it hard
 * mid-stream (no chance to clean up, like a crash or a flat battery as far as the process
 * goes), then reopen the file. It must pass SQLite's integrity check, hold every card the child
 * reported as saved, and hold no half-saved card.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import { SETUP, tempFolder, testContext } from './test-support.js';

// jiti/register lets the child run the TypeScript sources directly.
const cwd = fileURLToPath(new URL('..', import.meta.url));
const child = fileURLToPath(new URL('./kill-child.ts', import.meta.url));

function runAndKill(folder: string, killAfter: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['--import', 'jiti/register', child, folder], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let saved = 0;
    let err = '';
    proc.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      for (const m of chunk.matchAll(/saved (\d+)/g)) saved = Math.max(saved, Number(m[1]));
      if (saved >= killAfter && proc.exitCode === null) proc.kill('SIGKILL');
    });
    proc.stderr.setEncoding('utf8').on('data', (c: string) => (err += c));
    proc.on('error', reject);
    proc.on('exit', (code, signal) => {
      if (signal === null && code !== 0) reject(new Error(`child failed (${code}): ${err}`));
      else resolve(saved);
    });
  });
}

describe('a crash while saving cards', () => {
  it.each([25, 120])(
    'keeps every card reported saved, and no half card (killed after %i)',
    async (killAfter) => {
      const folder = tempFolder();
      const setup = EventStore.create(folder, SETUP, testContext());
      for (let n = 1; n <= 400; n++) {
        setup.addEntry({
          number: n,
          riders: [{ givenName: 'Rider', familyName: String(n) }],
          tier: 'competitive',
          status: 'riding',
          classes: ['Trial 4'],
        });
      }
      setup.close();

      const reported = await runAndKill(folder, killAfter);
      expect(reported).toBeGreaterThanOrEqual(killAfter);

      const store = EventStore.open(folder, testContext()); // runs the integrity check
      const cards = store.cards();
      store.close();
      expect(cards.length).toBeGreaterThanOrEqual(reported);
      expect(cards.length).toBeLessThan(800); // it really was stopped part-way
      for (const c of cards) expect(c.scores).toEqual([0, 1, 2, 3]);
    },
    60_000,
  );
});
