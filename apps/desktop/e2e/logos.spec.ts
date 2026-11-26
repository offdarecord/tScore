import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// A 1 × 1 pixel PNG: enough to stand in for a club's logo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let run: Launched;
let window: Page;

test.beforeEach(async () => {
  run = await launchApp();
  ({ window } = run);
});

test.afterEach(async () => {
  await run?.app.close();
});

async function pick(path: string) {
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, path);
}

test('the event and sponsor logos are chosen on Event setup and shown on the big screen', async () => {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  const card = window.getByRole('region', { name: 'Logos' });
  await expect(card).toBeVisible();

  const logo = join(run.userData, 'club.png');
  writeFileSync(logo, PNG);
  await pick(logo);
  await card.getByRole('button', { name: 'Choose event logo…' }).click();
  await expect(card.getByRole('img', { name: 'event logo' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Change event logo…' })).toBeVisible();

  await card.getByRole('button', { name: 'Add sponsor logo…' }).click();
  await card.getByRole('button', { name: 'Add sponsor logo…' }).click();
  await expect(card.getByRole('img', { name: /sponsor logo/ })).toHaveCount(2);
  await card.getByRole('button', { name: 'Remove sponsor logo 1' }).click();
  await expect(card.getByRole('img', { name: /sponsor logo/ })).toHaveCount(1);

  // Not a picture, whatever the file is called.
  const fake = join(run.userData, 'fake.png');
  writeFileSync(fake, 'not a picture');
  await pick(fake);
  await card.getByRole('button', { name: 'Add sponsor logo…' }).click();
  await expect(card.getByRole('alert')).toContainText(
    'A logo must be a PNG or JPEG picture. (TS-SET-005)',
  );

  await window.mouse.move(700, 20);
  const axe = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await window
    .getByRole('navigation', { name: 'Event' })
    .getByRole('button', { name: 'Results' })
    .click();
  const opened = run.app.waitForEvent('window');
  await window.getByRole('button', { name: 'Show live scores' }).click();
  const screen = await opened;
  await expect(screen.locator('img.live-logo')).toHaveCount(1);
  await expect(screen.locator('img.live-sponsor')).toHaveCount(1);
  // The tScore credit (#110): always there, with a QR code to the project.
  const credit = screen.locator('.live-credit');
  await expect(credit).toContainText('Results brought to you by');
  await expect(credit.getByRole('img', { name: 'tScore', exact: true })).toBeVisible();
  await expect(
    credit.getByRole('img', { name: 'https://github.com/offdarecord/tScore' }),
  ).toBeVisible();
  if (process.env.TSCORE_SHOT) await screen.screenshot({ path: process.env.TSCORE_SHOT });
});
