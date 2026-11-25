import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// Invented names only.

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

test('section names, observers and officials are entered in Event setup and kept', async () => {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel(/^Event name/).fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();

  const card = window.getByRole('region', { name: 'Sections and officials' });
  await card.getByLabel('Name of section 1', { exact: true }).fill('Creek bed');
  await card.getByLabel('Observer of section 1', { exact: true }).fill('Pat Brown & Sam Lee');
  await card.getByLabel('Observer of section 4', { exact: true }).fill('Alex Green');
  await card.getByRole('button', { name: 'Add an official' }).click();
  await card.getByLabel('Name of official 1').fill('Jo Smith');
  // A name without a role is asked about before saving.
  await window.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    window.getByText('Say what Jo Smith did, e.g. Clerk of Course.').first(),
  ).toBeVisible();
  await card.getByLabel('Role of official 1').fill('Clerk of Course');
  await window.getByRole('button', { name: 'Save changes' }).click();
  await expect(window.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  const results = await new AxeBuilder({ page: window })
    .include('[aria-label="Sections and officials"]')
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Away and back: still there.
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await nav().getByRole('button', { name: 'Event setup' }).click();
  await expect(card.getByLabel('Name of section 1', { exact: true })).toHaveValue('Creek bed');
  await expect(card.getByLabel('Observer of section 4', { exact: true })).toHaveValue('Alex Green');
  await expect(card.getByLabel('Role of official 1')).toHaveValue('Clerk of Course');
  await expect(
    card.getByRole('checkbox', { name: /Thank the observers and officials/ }),
  ).toBeChecked();

  // The names stay out of the log.
  const logs = readFileSync(join(run.userData, 'logs', 'main.log'), 'utf8');
  expect(logs).not.toContain('Pat Brown');
  expect(logs).not.toContain('Jo Smith');
});
