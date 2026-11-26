import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { launchApp, type Launched } from './app';

// An invented club card, shared as a club would share it (issue #108).

const runs: Launched[] = [];
test.afterEach(async () => {
  while (runs.length) await runs.pop()?.app.close();
});

async function launch() {
  const run = await launchApp();
  runs.push(run);
  return run;
}

/** A 1×1 PNG: a stand-in for the blank card's picture. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

const PROFILE = {
  schema: 'tscore.card_profile/1',
  id: 'example-club-10',
  name: 'Example club card, 10 sections',
  card: { width_mm: 55, height_mm: 140 },
  rows: 10,
  grid: { unit: 'column-width', row_pitch: 0.7, cell_radius: 0.15 },
  columns: [
    { score: 0, across: -1.5 },
    { score: 1, across: -1 },
    { score: 2, across: 1 },
    { score: 3, across: 1.5 },
    { score: 5, across: 2 },
  ],
  locator: 'black-column',
  marking_style: 'punch',
  correction_rules: 'inverse-all-but-one',
  thresholds: {
    mark: 0.5,
    confidence_gap: 0.2,
    colour_channel: 'luma',
    tuned_from: { source: 'synthetic', cards: 10, rows: 100, rows_read: 1, wrong_auto_accepts: 0 },
  },
  // A file can't make itself trusted: tScore imports it as assisted anyway.
  trust: 'trusted',
  blank_image: 'blank.png',
};

function files() {
  const dir = mkdtempSync(join(tmpdir(), 'tscore-card-'));
  const good = join(dir, 'example-club-10.tscore-card');
  writeFileSync(
    good,
    zipSync({ 'profile.json': strToU8(JSON.stringify(PROFILE)), 'blank.png': PNG }),
  );
  const fake = join(dir, 'fake.tscore-card');
  writeFileSync(fake, 'not a card type');
  return { dir, good, fake };
}

async function pick(run: Launched, file: string) {
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, file);
}

async function noAxeViolations(window: Page) {
  const axe = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

async function openCardTypes(window: Page) {
  await window.getByRole('button', { name: 'Card types' }).click();
  await expect(window.getByRole('heading', { name: 'Card types', level: 2 })).toBeVisible();
}

test('a club card type is imported, shared, and imported the same on another laptop', async () => {
  const { dir, good, fake } = files();
  const one = await launch();
  const window = one.window;
  await openCardTypes(window);
  await expect(window.getByText('Regional card, 16 sections')).toBeVisible();
  await expect(window.getByText('No card types imported on this laptop yet.')).toBeVisible();
  await noAxeViolations(window);

  // A fake file is refused with its code, and nothing changes.
  await pick(one, fake);
  await window.getByRole('button', { name: 'Import card type…' }).click();
  await expect(window.getByRole('alert')).toContainText('TS-CARD-009');
  await expect(window.getByText('No card types imported on this laptop yet.')).toBeVisible();

  await pick(one, good);
  await window.getByRole('button', { name: 'Import card type…' }).click();
  await expect(window.getByRole('status')).toContainText('Imported Example club card');
  const row = window.getByRole('row', { name: /Example club card/ });
  await expect(row).toContainText('You confirm every card');

  // Share: what the file holds, the credit, then save and email.
  await row.getByRole('button', { name: 'Share Example club card, 10 sections…' }).click();
  const share = window.getByRole('dialog', { name: 'Share Example club card, 10 sections' });
  await expect(share).toBeVisible();
  await expect(share.getByText('profile.json', { exact: true })).toBeVisible();
  await expect(share.getByText('blank.png', { exact: true })).toBeVisible();
  await expect(share.getByRole('img', { name: 'The blank card in the file' })).toBeVisible();
  await share.getByLabel('Club').fill('Example Trials Club');
  await share.getByLabel('State').fill('Example State');
  const shown = share.getByLabel('The card type, exactly as it goes in the file');
  await expect(shown).toContainText('"trust": "assisted"');
  await expect(shown).toContainText('"club": "Example Trials Club"');
  await window.waitForFunction(() =>
    [...document.querySelectorAll('.mantine-Modal-content, .mantine-Modal-overlay')].every(
      (el) => getComputedStyle(el).opacity === '1' || getComputedStyle(el).opacity === '0.6',
    ),
  );
  await noAxeViolations(window);

  const saveTo = join(dir, 'shared', 'example-club-10.tscore-card');
  await one.app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (() =>
      Promise.resolve({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, saveTo);
  mkdirSync(join(dir, 'shared'));
  await share.getByRole('button', { name: 'Save file…' }).click();
  await expect(share.getByRole('status')).toContainText('Saved as example-club-10.tscore-card');
  // Exactly the profile and the picture: nothing else.
  expect(Object.keys(unzipSync(readFileSync(saveTo))).sort()).toEqual([
    'blank.png',
    'profile.json',
  ]);

  await one.app.evaluate(({ shell }) => {
    shell.openExternal = ((url: string) => {
      (globalThis as { opened?: string }).opened = url;
      return Promise.resolve();
    }) as typeof shell.openExternal;
  });
  await share.getByRole('button', { name: 'Email it…' }).click();
  await expect(share.getByRole('status')).toContainText('Attach example-club-10.tscore-card');
  const url = await one.app.evaluate(() => (globalThis as { opened?: string }).opened ?? '');
  expect(url).toMatch(/^mailto:tscoreapp@outlook\.com\?subject=tScore%20card%20profile/);
  expect(decodeURIComponent(url)).toContain('example-club-10.tscore-card is attached');

  await share.getByRole('button', { name: 'Copy address' }).click();
  await expect(share.getByRole('status')).toContainText('Copied tscoreapp@outlook.com');
  expect(await one.app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    'tscoreapp@outlook.com',
  );
  await expect(share.getByRole('link', { name: 'Use the New card type form' })).toHaveAttribute(
    'href',
    /new_card_type\.yml/,
  );
  await share.getByRole('button', { name: 'Done' }).click();

  // Another laptop imports the shared file and keeps the very same card type.
  const two = await launch();
  await openCardTypes(two.window);
  await pick(two, saveTo);
  await two.window.getByRole('button', { name: 'Import card type…' }).click();
  await expect(two.window.getByRole('status')).toContainText('Imported Example club card');
  await expect(two.window.getByRole('row', { name: /Example club card/ })).toContainText(
    'Example Trials Club, Example State',
  );
  const kept = (run: Launched) =>
    JSON.parse(
      readFileSync(join(run.userData, 'card-profiles', 'example-club-10.json'), 'utf8'),
    ) as Record<string, unknown>;
  const { credit, ...second } = kept(two);
  expect(second).toEqual(kept(one));
  expect(credit).toEqual({ club: 'Example Trials Club', state: 'Example State' });
  expect(readFileSync(join(two.userData, 'card-profiles', 'example-club-10.blank.png'))).toEqual(
    PNG,
  );
});
