import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

let run: Launched;
let window: Page;

test.beforeEach(async () => {
  run = await launchApp();
  ({ window } = run);
});

test.afterEach(async () => {
  await run?.app.close();
});

async function openForm() {
  await window.getByRole('button', { name: 'About' }).click();
  await window.getByRole('button', { name: 'Suggest a feature' }).click();
  const form = window.getByRole('dialog', { name: 'Suggest a feature' });
  // Let the About box finish fading out and the form fading in: half-faded text fails contrast.
  await expect(window.getByRole('dialog', { name: 'About tScore' })).toHaveCount(0);
  await expect(form).toBeVisible();
  await window.waitForFunction(() =>
    [...document.querySelectorAll('.mantine-Modal-content, .mantine-Modal-overlay')].every(
      (el) => getComputedStyle(el).opacity === '1' || getComputedStyle(el).opacity === '0.6',
    ),
  );
  return form;
}

test('a suggestion needs its required answers, then copies, saves and emails', async () => {
  const form = await openForm();
  await form.getByRole('button', { name: 'Copy' }).click();
  await expect(form.getByRole('alert')).toContainText('Please answer the questions marked *');

  await form.getByLabel('In a few words, what would you like? *').fill('Bigger rider numbers');
  await form.getByLabel('What do you do at events? *').selectOption('Results desk');
  await form
    .getByLabel("What happens today, and what's hard about it? *")
    .fill('Hard to read in the sun.');
  await form
    .getByLabel("How would you know it's working? *")
    .fill('I can read it at arm’s length.');

  await form.getByRole('button', { name: 'Copy' }).click();
  await expect(form.getByRole('status')).toContainText('Copied.');
  const copied = await run.app.evaluate(({ clipboard }) => clipboard.readText());
  expect(copied).toContain('1. In a few words, what would you like?\nBigger rider numbers');
  expect(copied).toContain('Screen: Home');
  expect(copied).toMatch(/tScore version: \d+\.\d+\.\d+/);

  const file = join(mkdtempSync(join(tmpdir(), 'tscore-suggest-')), 'idea.txt');
  await run.app.evaluate(({ dialog }, saveTo) => {
    dialog.showSaveDialog = (() =>
      Promise.resolve({ canceled: false, filePath: saveTo })) as typeof dialog.showSaveDialog;
  }, file);
  await form.getByRole('button', { name: 'Save as file…' }).click();
  await expect(form.getByRole('status')).toContainText('Saved.');
  expect(readFileSync(file, 'utf8')).toContain('Bigger rider numbers\r\n');

  await run.app.evaluate(({ shell }) => {
    (globalThis as { opened?: string }).opened = '';
    shell.openExternal = ((url: string) => {
      (globalThis as { opened?: string }).opened = url;
      return Promise.resolve();
    }) as typeof shell.openExternal;
  });
  await form.getByRole('button', { name: 'Email…' }).click();
  await expect(form.getByRole('status')).toContainText('mail app');
  const url = await run.app.evaluate(() => (globalThis as { opened?: string }).opened ?? '');
  expect(url).toMatch(
    /^mailto:tscoreapp@outlook\.com\?subject=tScore%20feature%20suggestion&body=/,
  );
  expect(decodeURIComponent(url)).toContain('Bigger rider numbers');
});

test('the suggestion form meets WCAG 2.2 AA (automated check)', async () => {
  await openForm();
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
});
