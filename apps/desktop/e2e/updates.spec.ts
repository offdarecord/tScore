import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './app';

// The updater is stubbed (TSCORE_TEST_UPDATER): these tests never reach GitHub.

const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  version: string;
};

let app: ElectronApplication | undefined;
let window: Page;

async function launch(scenario: string, from?: { userData: string; eventsDir: string }) {
  ({ app, window } = await launchApp(from, { TSCORE_TEST_UPDATER: scenario }));
}

test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function about() {
  await window.getByRole('button', { name: 'About' }).click();
  const dialog = window.getByRole('dialog', { name: 'About tScore' });
  await expect(dialog).toBeVisible();
  // Let the box finish fading in: half-faded text fails the contrast check.
  await window.waitForFunction(() =>
    [...document.querySelectorAll('.mantine-Modal-content, .mantine-Modal-overlay')].every(
      (el) => getComputedStyle(el).opacity === '1' || getComputedStyle(el).opacity === '0.6',
    ),
  );
  return dialog;
}

async function expectNoAxeViolations() {
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} element(s))`),
  ).toEqual([]);
}

test('a new version downloads at start, then Home and About say it installs on close', async () => {
  await launch('update');
  await expect(
    window.getByText('tScore 9.9.9 is ready: it installs when you close tScore.'),
  ).toBeVisible();
  await expectNoAxeViolations();

  const dialog = await about();
  await expect(dialog.getByText(`Version ${pkg.version}`)).toBeVisible();
  await expect(dialog.getByText('Ready: close tScore to install 9.9.9.')).toBeVisible();
  await expect(dialog.getByText(/^Last checked /)).toBeVisible();
  await expectNoAxeViolations();
});

test('Home shows a download in progress', async () => {
  await launch('downloading');
  await expect(window.getByText('Downloading tScore 9.9.9…')).toBeVisible();
  await expect(window.getByRole('progressbar', { name: 'Download 40% done' })).toBeVisible();
  await expectNoAxeViolations();
});

test('Check for updates says when this is the latest version', async () => {
  await launch('latest');
  const dialog = await about();
  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await expect(dialog.getByText('You have the latest version.')).toBeVisible();
  await expect(dialog.getByText(/^Last checked /)).toBeVisible();
  // Nothing to say on Home.
  await window.keyboard.press('Escape');
  await expect(window.getByText(/ready: it installs/)).toHaveCount(0);
});

test('Check for updates says when there is no internet', async () => {
  await launch('offline');
  const dialog = await about();
  await expect(dialog.getByText('Not checked yet.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await expect(dialog.getByText("Couldn't check: no internet.")).toBeVisible();
});

test('never checks while an event is open', async () => {
  await launch('latest');
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();

  const dialog = await about();
  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await expect(
    dialog.getByText("Close the event first: tScore doesn't update during an event."),
  ).toBeVisible();
});

test('the first start after an update says which version tScore is now', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'tscore-e2e-'));
  const eventsDir = join(mkdtempSync(join(tmpdir(), 'tscore-e2e-events-')), 'tScore');
  writeFileSync(join(userData, 'updates.json'), JSON.stringify({ lastVersion: '0.0.1' }));
  await launch('latest', { userData, eventsDir });
  await expect(window.getByText(`tScore is now version ${pkg.version}.`)).toBeVisible();

  // Only the first start.
  await app?.close();
  await launch('latest', { userData, eventsDir });
  await expect(window.getByRole('heading', { name: 'No event open' })).toBeVisible();
  await expect(window.getByText(/tScore is now version/)).toHaveCount(0);
});

test('on a Mac, About says updates are by hand and links the latest release', async () => {
  await launch('mac');
  const dialog = await about();
  await expect(dialog.getByText(/updates by hand until it's signed/)).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Latest release' })).toHaveAttribute(
    'href',
    'https://github.com/offdarecord/tScore/releases/latest',
  );
  await expect(dialog.getByRole('button', { name: 'Check for updates' })).toHaveCount(0);
});
