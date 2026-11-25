import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// Invented events only.

let run: Launched;
let window: Page;

test.beforeEach(async () => {
  run = await launchApp();
  ({ window } = run);
});

test.afterEach(async () => {
  await run?.app.close();
});

/** A date `days` before today, as YYYY-MM-DD. */
function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function newEvent(name: string, code: string, date: string): Promise<string> {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel(/^Event name/).fill(name);
  await window.getByLabel(/^Event code/).fill(code);
  await window.getByLabel(/^Date\b/).fill(date);
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  await window.getByRole('button', { name: '← All events' }).click();
  return join(run.eventsDir, `${date} ${code}`);
}

/** A full-size card photo (noise, so it doesn't compress), made with Electron's image tools. */
async function bigPhoto(file: string) {
  const jpeg = await run.app.evaluate(({ nativeImage }) => {
    const w = 1600;
    const h = 1000;
    const pixels = Buffer.alloc(w * h * 4);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2654435761) >>> 24;
    return nativeImage
      .createFromBitmap(pixels, { width: w, height: h })
      .toJPEG(92)
      .toString('base64');
  });
  writeFileSync(file, Buffer.from(jpeg, 'base64'));
}

test('an old event is offered, its card scans removed, then deleted to the Recycle Bin', async () => {
  const old = await newEvent('Example Autumn Trial', 'EAT', daysAgo(60));
  await newEvent('Example Recent Trial', 'ERT', daysAgo(10));
  mkdirSync(join(old, 'cards'), { recursive: true });
  const photo = join(old, 'cards', 'r1-d1-l1.jpg');
  await bigPhoto(photo);
  const before = statSync(photo).size;
  expect(before).toBeGreaterThan(100_000);

  // Back on Home (reloaded): the prompt offers the old event only.
  await window.reload();
  const prompt = window.getByRole('status').filter({ hasText: 'over a month old' });
  await expect(prompt).toContainText('1 event is over a month old');
  await prompt.getByRole('button', { name: 'Review in Manage events' }).click();
  await expect(window.getByRole('heading', { name: 'Manage events', level: 2 })).toBeVisible();
  await expect(window.getByRole('checkbox', { name: 'Tick Example Autumn Trial' })).toBeChecked();
  await expect(
    window.getByRole('checkbox', { name: 'Tick Example Recent Trial' }),
  ).not.toBeChecked();

  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Remove card scans: the photo becomes a small copy; the event file stays.
  await window.getByRole('button', { name: 'Remove card scans…' }).click();
  const remove = window.getByRole('dialog', { name: 'Remove card scans' });
  await expect(remove).toContainText("Results aren't final");
  await remove.getByRole('button', { name: 'Remove card scans' }).click();
  await expect(window.getByText(/Card scans removed: 1 photo shrunk/)).toBeVisible();
  expect(statSync(photo).size).toBeLessThan(before / 5);
  expect(existsSync(join(old, 'event.sqlite'))).toBe(true);
  await expect(window.getByText(/Scans removed/)).toBeVisible();

  // Delete: only once the code is typed. The folder goes; the other event stays.
  await window.getByRole('checkbox', { name: 'Tick Example Autumn Trial' }).check();
  await window.getByRole('button', { name: 'Delete event…' }).click();
  const del = window.getByRole('dialog', { name: 'Delete Example Autumn Trial' });
  const go = del.getByRole('button', { name: 'Delete Example Autumn Trial' });
  await expect(go).toBeDisabled();
  await del.getByLabel(/To confirm, type the event's code/).fill('ert');
  await expect(go).toBeDisabled();
  await del.getByLabel(/To confirm, type the event's code/).fill('eat');
  await go.click();
  await expect(window.getByText(/1 event moved to the Recycle Bin/)).toBeVisible();
  expect(existsSync(old)).toBe(false);
  expect(existsSync(join(run.eventsDir, `${daysAgo(10)} ERT`))).toBe(true);

  // Home: no prompt now, and the deleted event is off the recent list.
  await window.getByRole('button', { name: '← All events' }).click();
  await expect(window.getByRole('button', { name: 'Open Example Recent Trial' })).toBeVisible();
  await expect(window.getByRole('button', { name: 'Open Example Autumn Trial' })).toHaveCount(0);
  await expect(window.getByText('over a month old')).toHaveCount(0);
});

test('a recent event row has a menu to show it, tidy it, or manage events', async () => {
  await newEvent('Example Recent Trial', 'ERT', daysAgo(10));
  await window.getByRole('button', { name: 'More for Example Recent Trial' }).click();
  await expect(window.getByRole('menuitem', { name: 'Show in folder' })).toBeVisible();
  await window.getByRole('menuitem', { name: 'Delete event…' }).click();
  const del = window.getByRole('dialog', { name: 'Delete Example Recent Trial' });
  await expect(del).toBeVisible();
  await del.getByRole('button', { name: 'Cancel' }).click();
  await expect(window.getByRole('heading', { name: 'Manage events', level: 2 })).toBeVisible();
});
