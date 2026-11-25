import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// Invented riders only. One card is typed for 00:10 today, so the clock must be past that.

let run: Launched;
let window: Page;

test.afterEach(async () => {
  await run?.app.close();
});

const nav = () => window.getByRole('navigation', { name: 'Event' });
const scheme = () => window.locator('html').getAttribute('data-mantine-color-scheme');
const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

async function accessible(name: string) {
  await window.mouse.move(700, 20);
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${name}: ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
    ),
  ).toEqual([]);
}

test('Light is the default, and Dark is kept on this laptop after a restart', async () => {
  run = await launchApp();
  ({ window } = run);
  const control = window.getByRole('radiogroup', { name: 'Colour scheme' });
  await expect(control).toBeVisible();
  expect(await scheme()).toBe('light');

  await control.getByText('Dark', { exact: true }).click();
  expect(await scheme()).toBe('dark');

  await run.app.close();
  run = await launchApp(run);
  ({ window } = run);
  await expect(window.getByRole('heading', { name: 'No event open' })).toBeVisible();
  expect(await scheme()).toBe('dark');
});

test('Match Windows (Match System on a Mac) follows the system setting', async () => {
  run = await launchApp();
  ({ window } = run);
  await window.emulateMedia({ colorScheme: 'dark' });
  await window
    .getByRole('radiogroup', { name: 'Colour scheme' })
    .getByText(process.platform === 'darwin' ? 'Match System' : 'Match Windows')
    .click();
  expect(await scheme()).toBe('dark');
  await window.emulateMedia({ colorScheme: 'light' });
  await expect.poll(scheme).toBe('light');
});

test('every screen meets WCAG 2.2 AA in Dark (automated check)', async () => {
  test.skip(new Date().getHours() < 1, 'needs the local time to be after 01:00');
  run = await launchApp();
  ({ window } = run);
  await window.setViewportSize({ width: 1024, height: 700 });
  await window
    .getByRole('radiogroup', { name: 'Colour scheme' })
    .getByText('Dark', { exact: true })
    .click();
  await accessible('No event open');

  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill(today());
  await window.getByLabel('Lap 1 starts').fill('00:00');
  await window.getByLabel('Laps for Trial 3').fill('2');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();

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
  await accessible('Import review');
  await window.getByRole('button', { name: 'Import 3 riders' }).click();
  await expect(window.getByText('3 riders imported.')).toBeVisible();

  await nav().getByRole('button', { name: 'Manual entry' }).click();
  const rider = window.getByLabel('Rider: number or name');
  await rider.fill('1');
  await rider.press('Enter');
  await window.getByLabel('Card in at').fill('00:10');
  const scores = window.getByLabel('Scores, section 1 onwards');
  await scores.fill('0123500000');
  await scores.press('Enter');
  await expect(window.getByText(/Saved rider 1 lap 1/)).toBeVisible();

  for (const page of [
    'Pre-event check',
    'Event setup',
    'Riders',
    'Card labels',
    'Manual entry',
    'Progress',
    'Still on course',
    'Results',
  ]) {
    await nav()
      .getByRole('button', { name: new RegExp(`^${page}`) })
      .click();
    await expect(window.getByRole('heading', { name: page }).first()).toBeVisible();
    await accessible(page);
  }
});
