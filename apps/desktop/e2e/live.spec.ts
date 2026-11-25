import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// Invented riders only. Cards are typed for 00:10 today, so the clock must be past that.

let run: Launched;
let window: Page;

test.beforeEach(async () => {
  test.skip(new Date().getHours() < 1, 'needs the local time to be after 01:00');
  run = await launchApp();
  ({ window } = run);
});

test.afterEach(async () => {
  await run?.app.close();
});

const nav = () => window.getByRole('navigation', { name: 'Event' });
const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

async function typeCard(number: number, lap: number, scores: string) {
  await nav().getByRole('button', { name: 'Manual entry' }).click();
  const rider = window.getByLabel('Rider: number or name');
  await rider.fill(String(number));
  await rider.press('Enter');
  await window.getByLabel('Lap', { exact: true }).selectOption(String(lap));
  await window.getByLabel('Card in at').fill('00:10');
  const box = window.getByLabel('Scores, section 1 onwards');
  await box.fill(scores);
  await box.press('Enter');
  await expect(window.getByText(new RegExp(`Saved rider ${number} lap ${lap}`))).toBeVisible();
}

test('the big screen shows the class live, follows new cards, and never shows NC scores', async () => {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill(today());
  await window.getByLabel('Lap 1 starts').fill('00:00');
  await window.getByLabel('Laps for Trial 3').fill('2');
  await window.getByRole('button', { name: 'Create event' }).click();
  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    [
      'Number,Given name,Family name,Class,Club,Competition status',
      '1,Avery,Stone,Trial 3,,',
      '2,Blake,River,Trial 3,,',
      '3,Casey,Hill,Trial 3,,NC',
    ].join('\r\n'),
  );
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, csv);
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 3 riders' }).click();
  await expect(window.getByText('3 riders imported.')).toBeVisible();
  await typeCard(1, 1, '0000000000');
  await typeCard(3, 1, '5555555555');

  await nav().getByRole('button', { name: 'Results' }).click();
  const opened = run.app.waitForEvent('window');
  await window.getByRole('button', { name: 'Show live scores' }).click();
  const screen = await opened;
  await expect(window.getByRole('button', { name: 'Close live scores' })).toBeVisible();

  await expect(screen.getByRole('heading', { name: 'Example Club Trial', level: 1 })).toBeVisible();
  await expect(screen.getByText(/^PROVISIONAL · \d+ cards to come$/)).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Trial 3', level: 2 })).toBeVisible();
  const avery = screen.getByRole('row', { name: /Avery Stone/ });
  await expect(avery).toContainText('Lap 1 of 2');
  await expect(avery.getByRole('cell').last()).toHaveText('0');
  const blake = screen.getByRole('row', { name: /Blake River/ });
  await expect(blake).toContainText('No card in yet');
  await expect(blake.getByRole('cell').first()).toHaveText('');
  // NC: counts only, never a total.
  const casey = screen.getByRole('row', { name: /Casey Hill/ });
  await expect(casey.getByRole('cell').first()).toHaveText('NC');
  await expect(casey.getByRole('cell').last()).toHaveText('');
  await expect(casey).not.toContainText('50');

  // A new card shows up on its own.
  await typeCard(1, 2, '1000000000');
  await expect(avery).toContainText('Finished', { timeout: 10_000 });
  await expect(avery.getByRole('cell').last()).toHaveText('1');

  const results = await new AxeBuilder({ page: screen })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Esc on the big screen does nothing: a stray key mustn't close it.
  await screen.keyboard.press('Escape');
  await screen.waitForTimeout(500);
  expect(screen.isClosed()).toBe(false);
  await nav().getByRole('button', { name: 'Results' }).click();
  await expect(window.getByRole('button', { name: 'Close live scores' })).toBeVisible();

  // The desk closes it.
  const closed = screen.waitForEvent('close');
  await window.getByRole('button', { name: 'Close live scores' }).click();
  await closed;
  await expect(window.getByRole('button', { name: 'Show live scores' })).toBeVisible({
    timeout: 5_000,
  });
});
