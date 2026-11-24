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

/** A new event, at its Event setup screen, for the screens that need one. */
async function newEvent() {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel('Date', { exact: true }).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
}

test('"Scan desk" is marked as coming later and explains why', async () => {
  await newEvent();
  const button = window
    .getByRole('navigation', { name: 'Event' })
    .getByRole('button', { name: 'Scan desk' });
  await expect(button).toHaveAttribute('aria-disabled', 'true');

  await button.hover();
  await expect(window.getByRole('tooltip')).toHaveText('Coming in a later version of tScore');

  // Clicking does nothing: still on the same screen, no dialog opened. `force` because
  // Playwright won't click an aria-disabled button by default; a volunteer still can.
  await button.click({ force: true });
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  await expect(window.getByRole('dialog')).toHaveCount(0);
});

test('keyboard users get the same explanation', async () => {
  await newEvent();
  const nav = window.getByRole('navigation', { name: 'Event' });
  // Tab to it, as a keyboard user would: back one step from Manual entry.
  await nav.getByRole('button', { name: 'Manual entry' }).focus();
  await window.keyboard.press('Shift+Tab');
  await expect(nav.getByRole('button', { name: 'Scan desk' })).toBeFocused();
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
