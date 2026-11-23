import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './app';

const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  version: string;
};

let app: ElectronApplication;
let window: Page;

test.beforeEach(async () => {
  ({ app, window } = await launchApp());
});

test.afterEach(async () => {
  await app?.close();
});

test('opens on the "No event open" screen', async () => {
  await expect(window).toHaveTitle('tScore');
  await expect(window.getByRole('heading', { name: 'tScore', level: 1 })).toBeVisible();
  await expect(window.getByRole('heading', { name: 'No event open' })).toBeVisible();
  await expect(window.getByText('No events yet.')).toBeVisible();
});

test('About shows the installed version', async () => {
  await window.getByRole('button', { name: 'About' }).click();
  const dialog = window.getByRole('dialog', { name: 'About tScore' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`Version ${pkg.version}`)).toBeVisible();
  await window.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('"Restore from backup" is marked as coming later and explains why', async () => {
  const button = window.getByRole('button', { name: 'Restore from backup' });
  await expect(button).toHaveAttribute('aria-disabled', 'true');

  await button.hover();
  await expect(window.getByRole('tooltip')).toHaveText('Coming in a later version of tScore');

  // Clicking does nothing: still on the same screen, no dialog opened. `force` because
  // Playwright won't click an aria-disabled button by default; a volunteer still can.
  await button.click({ force: true });
  await expect(window.getByRole('heading', { name: 'No event open' })).toBeVisible();
  await expect(window.getByRole('dialog')).toHaveCount(0);
});

test('keyboard users get the same explanation', async () => {
  await window.getByRole('button', { name: 'Restore from backup' }).focus();
  await expect(window.getByRole('tooltip')).toHaveText('Coming in a later version of tScore');
});

test('the window has no access to Node (security baseline)', async () => {
  const exposed = await window.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    bridge: typeof (globalThis as Record<string, unknown>)['tscore'],
  }));
  expect(exposed).toEqual({ require: 'undefined', process: 'undefined', bridge: 'object' });
});

test('meets WCAG 2.2 AA (automated accessibility check)', async () => {
  // Legacy mode runs axe inside this window; the default opens a new page, which Electron
  // doesn't allow.
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} element(s))`),
  ).toEqual([]);
});
