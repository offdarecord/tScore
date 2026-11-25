/// <reference lib="dom" />
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from '../e2e/app';

// The invented demo event only: made-up riders, clubs and scores (fixtures/demo/).

const MEDIA = join(__dirname, '../../../docs/media');
const RIDERS = join(__dirname, '../../../fixtures/demo/riders.csv');
const SIZE = { width: 1280, height: 800 };

let run: Launched;
let window: Page;

test.afterEach(async () => {
  await run?.app.close();
});

const nav = () => window.getByRole('navigation', { name: 'Event' });
const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Save the window, mouse out of the way. The throwaway folders' paths include this computer's
 * user name, so they're shown as a volunteer's Documents folder instead: the pictures are public.
 */
async function shot(name: string) {
  await window.evaluate(
    ([from, to]) => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (n.textContent?.includes(from)) n.textContent = n.textContent.split(from).join(to);
      }
    },
    [run.eventsDir, String.raw`C:\Users\Volunteer\Documents\tScore`] as const,
  );
  await window.mouse.move(SIZE.width - 5, 5);
  await window.waitForTimeout(300);
  await window.screenshot({ path: join(MEDIA, `${name}.png`) });
  // Nothing from this computer may show: fail rather than publish it.
  const text = await window.evaluate(() => document.body.innerText);
  expect(text).not.toContain(tmpdir());
  expect(text).not.toContain(userInfo().username);
}

/** Rider, lap, ten section scores, time handed in: a believable spread. */
const CARDS: [number, number, string, string][] = [
  [1, 1, '0010000100', '09:05'],
  [2, 1, '0110201000', '09:12'],
  [3, 1, '1013000210', '09:20'],
  [11, 1, '1102310011', '09:18'],
  [12, 1, '0100200100', '09:24'],
  [13, 1, '2113021010', '09:31'],
  [14, 1, '3125031100', '09:40'],
  [21, 1, '0000100000', '09:10'],
  [22, 1, '1000020010', '09:15'],
  [23, 1, '0101000100', '09:22'],
  [24, 1, '2015300120', '09:35'],
  [31, 1, '0001000000', '09:08'],
  [32, 1, '1100010000', '09:14'],
  [1, 2, '0000000100', '10:10'],
  [2, 2, '0100100000', '10:15'],
  [21, 2, '0010000000', '10:05'],
  [22, 2, '0000010000', '10:20'],
  [31, 2, '0000100000', '10:02'],
];

test('screens for the README and the feature tour', async () => {
  test.skip(new Date().getHours() < 11, 'the demo cards are handed in up to 10:20 today');
  run = await launchApp();
  ({ window } = run);
  await window.setViewportSize(SIZE);

  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Hilltop Club Trial');
  await window.getByLabel('Date', { exact: true }).fill(today());
  await window.getByLabel('Lap 1 starts').fill('08:30');
  for (const cls of ['Trial 1', 'Trial 2', 'Trial 3', 'Juniors']) {
    await window.getByLabel(`Laps for ${cls}`, { exact: true }).fill('2');
  }
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  await shot('event-setup');

  const csv = join(run.userData, 'riders.csv');
  writeFileSync(csv, readFileSync(RIDERS));
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, csv);
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  const importButton = window.getByRole('button', { name: /Import 13 riders/ });
  await expect(importButton).toBeVisible();
  await shot('import-review');
  await importButton.click();
  await expect(window.getByText('13 riders imported.')).toBeVisible();
  await shot('riders');

  await nav().getByRole('button', { name: 'Card labels' }).click();
  await expect(window.getByRole('heading', { name: 'Card labels' }).first()).toBeVisible();
  await shot('card-labels');

  await nav().getByRole('button', { name: 'Manual entry' }).click();
  const rider = window.getByLabel('Rider: number or name');
  const box = window.getByLabel('Scores, section 1 onwards');
  for (const [number, lap, scores, time] of CARDS) {
    await rider.fill(String(number));
    await rider.press('Enter');
    await window.getByLabel('Lap', { exact: true }).selectOption(String(lap));
    await window.getByLabel('Card in at').fill(time);
    await box.fill(scores);
    await box.press('Enter');
    await expect(window.getByText(new RegExp(`Saved rider ${number} lap ${lap}`))).toBeVisible();
  }
  // A card part-typed, so the card preview shows.
  await rider.fill('3');
  await rider.press('Enter');
  await box.fill('01003');
  await shot('manual-entry');
  await window.keyboard.press('Escape');

  for (const [page, file] of [
    ['Progress', 'progress'],
    ['Still on course', 'still-on-course'],
    ['Results', 'results'],
  ] as const) {
    await nav().getByRole('button', { name: page }).click();
    await expect(window.getByRole('heading', { name: page, level: 2 })).toBeVisible();
    await shot(file);
  }

  await nav().getByRole('button', { name: 'Pre-event check' }).click();
  await expect(window.getByRole('heading', { name: 'Pre-event check' }).first()).toBeVisible();
  await shot('pre-event-check');

  await nav().getByRole('button', { name: '← All events' }).click();
  await expect(window.getByRole('heading', { name: 'Recent events' })).toBeVisible();
  await shot('home');
});
