import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { launchApp } from './app';

const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  version: string;
};

let app: ElectronApplication | undefined;

test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

test('every start writes its own line to the log, and About shows the log', async () => {
  const launched = await launchApp();
  app = launched.app;
  const { window, userData } = launched;
  const mainLog = join(userData, 'logs', 'main.log');

  const text = readFileSync(mainLog, 'utf8');
  expect(text).toContain(`[start] tScore ${pkg.version} starting (pid `);
  expect(text).toContain(`logging to ${mainLog}`);
  // electron-log's own first message arrived too, so no file of its own.
  expect(text).toMatch(/\[info\] +tScore starting/);
  expect(readdirSync(join(userData, 'logs'))).toEqual(['main.log']);

  await window.getByRole('button', { name: 'About' }).click();
  const dialog = window.getByRole('dialog', { name: 'About tScore' });
  await expect(dialog.getByRole('button', { name: 'Show log folder' })).toBeVisible();
  await expect(dialog.getByText(`Log: ${mainLog}`)).toBeVisible();

  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} element(s))`),
  ).toEqual([]);
});

test("if electron-log's first message doesn't arrive, the session logs to its own file and says why", async () => {
  const launched = await launchApp(undefined, { TSCORE_TEST_LOSE_FIRST_LOG: '1' });
  app = launched.app;
  const { window, userData } = launched;
  const logs = join(userData, 'logs');

  const own = readdirSync(logs).find((f) => /^main-\d+\.log$/.test(f));
  expect(own).toBeDefined();
  const ownLog = join(logs, own ?? '');
  const ownText = readFileSync(ownLog, 'utf8');
  expect(ownText).toContain(`[start] tScore ${pkg.version} starting`);
  expect(ownText).toContain("electron-log's first message didn't reach the file");

  // The usual file still has the start line, and says where this session went.
  const usual = readFileSync(join(logs, 'main.log'), 'utf8');
  expect(usual).toContain(`[start] tScore ${pkg.version} starting`);
  expect(usual).toContain(`logs to ${ownLog}`);

  await window.getByRole('button', { name: 'About' }).click();
  await expect(window.getByText(`Log: ${ownLog}`)).toBeVisible();
});
