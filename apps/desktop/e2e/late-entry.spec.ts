import { writeFileSync } from 'node:fs';
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

async function eventWithTwoRiders() {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel('Date', { exact: true }).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    [
      'Number,Given name,Family name,Class,Club,Competition status',
      '1,Avery,Stone,Trial 3,,',
      '2,Blake,River,Trial 3,,',
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
  await window.getByRole('button', { name: 'Import 2 riders' }).click();
  await expect(window.getByText('2 riders imported.')).toBeVisible();
}

test('a late entry gets the next free number, and nobody else moves', async () => {
  await eventWithTwoRiders();
  await window.getByRole('button', { name: 'Late entry…' }).click();
  const dialog = window.getByRole('dialog', { name: 'Late entry' });
  const number = dialog.getByLabel('Rider number');
  await expect(number).toHaveValue('3');

  // A taken number is refused.
  await number.fill('2');
  await expect(dialog.getByText('Rider number 2 is already taken.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add rider' })).toBeDisabled();
  await number.fill('3');

  await dialog.getByLabel('Class').selectOption('Trial 3');
  await dialog.getByLabel('First name').fill('Avery');
  await dialog.getByLabel('Surname').fill('Stone');
  await expect(dialog.getByText('Rider 1 already has this name.')).toBeVisible();
  await dialog.getByLabel('First name').fill('Gray');
  await dialog.getByLabel('Surname').fill('Lake');
  await dialog.getByLabel('Machine').fill('Example 250');

  // A sidecar class asks for the passenger too.
  await dialog.getByLabel('Class').selectOption('Sidecar');
  await expect(dialog.getByLabel('Passenger first name')).toBeVisible();
  await dialog.getByLabel('Class').selectOption('Trial 3');
  await expect(dialog.getByLabel('Passenger first name')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Add rider' }).click();
  const added = window.getByRole('status').filter({ hasText: 'Rider 3 added: Gray Lake' });
  await expect(added).toBeVisible();
  const list = window.getByRole('region', { name: 'Rider list' });
  await expect(list.getByRole('row', { name: /^3 Gray Lake/ })).toContainText('Example 250');
  await expect(list.getByRole('row', { name: /^1 Avery Stone/ })).toBeVisible();

  await added.getByRole('button', { name: 'Go to Card labels' }).click();
  await expect(window.getByRole('heading', { name: 'Card labels', level: 2 })).toBeVisible();
});

test('the late entry form meets WCAG 2.2 AA (automated check)', async () => {
  await eventWithTwoRiders();
  await window.getByRole('button', { name: 'Late entry…' }).click();
  await expect(window.getByRole('dialog', { name: 'Late entry' })).toBeVisible();
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
