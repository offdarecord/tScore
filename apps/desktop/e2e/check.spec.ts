import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// Invented riders only.

let run: Launched;
let window: Page;

test.beforeEach(async () => {
  run = await launchApp();
  ({ window } = run);
});

test.afterEach(async () => {
  await run?.app.close();
});

const nav = () => window.getByRole('navigation', { name: 'Event' });

async function pick(path: string) {
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, path);
}

async function newEvent() {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel('Date', { exact: true }).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
}

const item = (title: string) =>
  window
    .getByRole('region', { name: 'Checks' })
    .getByRole('listitem')
    .filter({ has: window.getByText(new RegExp(`^${title} \\(`)) });

test('the pre-event check finds what to fix, and points to where', async () => {
  await newEvent();
  await nav().getByRole('button', { name: 'Pre-event check' }).click();
  const checks = window.getByRole('region', { name: 'Checks' });
  await expect(checks.getByRole('status')).toHaveText('1 thing to fix before the first card.');
  await expect(item('Event setup')).toContainText('(OK)');
  await expect(item('Riders')).toContainText('No riders yet.');
  await expect(item('Clock')).toContainText("Today isn't one of the event's dates (2027-02-06)");
  await expect(item('Backups')).toContainText('Backups are kept on this laptop only.');

  // Fix the riders.
  await item('Riders').getByRole('button', { name: 'Go to Riders' }).click();
  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    'Number,Given name,Family name,Class,Club,Competition status\r\n1,Avery,Stone,Trial 3,,\r\n',
  );
  await pick(csv);
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 1 rider' }).click();
  await expect(window.getByText('1 rider imported.')).toBeVisible();

  // Fix the backups: a second copy.
  await nav().getByRole('button', { name: 'Pre-event check' }).click();
  await expect(item('Riders')).toContainText('1 rider in 1 class.');
  await expect(item('Card labels')).toContainText('None printed yet (4 labels)');
  await item('Backups').getByRole('button', { name: 'Set up a second copy' }).click();
  await pick(mkdtempSync(join(tmpdir(), 'tscore-usb-')));
  await window
    .getByRole('region', { name: 'Saving and backup' })
    .getByRole('button', { name: 'Choose second copy…' })
    .click();
  await expect(window.getByText('Second copy set, and a backup made there.')).toBeVisible();

  await nav().getByRole('button', { name: 'Pre-event check' }).click();
  await expect(item('Backups')).toContainText('Every backup is also copied to');
  await expect(item('Backups')).toContainText('(OK)');
  await expect(window.getByRole('region', { name: 'Checks' }).getByRole('status')).toHaveText(
    'Ready, with 2 things to look at.',
  );
});

test('the pre-event check meets WCAG 2.2 AA (automated check)', async () => {
  await newEvent();
  await nav().getByRole('button', { name: 'Pre-event check' }).click();
  await expect(window.getByRole('region', { name: 'Checks' })).toBeVisible();
  await window.mouse.move(700, 20);
  await window.setViewportSize({ width: 1024, height: 700 });
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
    ),
  ).toEqual([]);
});
