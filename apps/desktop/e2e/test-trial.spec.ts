import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// The Test trial kit (#81), built as the release builds it. Invented riders only.

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
const root = resolve(__dirname, '../../..');

interface KeyCard {
  givenName: string;
  familyName: string;
  lap: number;
  scores: number[];
}

function buildKit(): { dir: string; cards: KeyCard[] } {
  const out = mkdtempSync(join(tmpdir(), 'tscore-kit-'));
  execFileSync(process.execPath, [join(root, 'scripts/build-test-trial.mjs'), out]);
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;
  const dir = join(out, `tScore-Test-Trial-${version}`);
  const key = JSON.parse(readFileSync(join(dir, 'answer-key.json'), 'utf8')) as {
    cards: KeyCard[];
  };
  return { dir, cards: key.cards };
}

async function pick(path: string) {
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, path);
}

test('a rehearsal with the kit is checked against its answer key', async () => {
  const kit = buildKit();

  // 1. The event, as the instructions say.
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel(/^Event name/).fill('TEST TRIAL Practice Event');
  await window.getByLabel(/^Event code/).fill('TEST');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  for (const cls of ['Trial 2', 'Trial 3', 'Trial 4']) {
    await window.getByLabel(`Sections per lap for ${cls}`, { exact: true }).fill('6');
    await window.getByLabel(`Laps for ${cls}`, { exact: true }).fill('2');
  }
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();

  // 2. Import the kit's Entryplace entry list.
  await pick(join(kit.dir, 'entry-list.xlsx'));
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 12 riders' }).click();
  await expect(window.getByText('12 riders imported.')).toBeVisible();

  // 3. Type every card from the key, one score wrong (as a misread would be).
  await nav().getByRole('button', { name: 'Manual entry' }).click();
  for (const [i, c] of kit.cards.entries()) {
    const scores = [...c.scores];
    if (i === 0) scores[2] = scores[2] === 5 ? 3 : 5;
    const rider = window.getByLabel(/^Rider: number or name/);
    await rider.fill(c.familyName);
    await rider.press('Enter');
    await window.getByLabel('Lap', { exact: true }).selectOption(String(c.lap));
    const box = window.getByLabel(/^Scores, section 1 onwards/);
    await box.fill(scores.join(''));
    await box.press('Enter');
    await expect(window.getByText(new RegExp(`Saved rider \\d+ lap ${c.lap}`))).toBeVisible();
  }

  // 4. Check it against the answer key.
  await nav().getByRole('button', { name: 'Results' }).click();
  await pick(join(kit.dir, 'answer-key.json'));
  await window.getByRole('button', { name: 'Check a test trial…' }).click();
  const check = window.getByRole('dialog', { name: 'Test trial check' });
  await expect(check).toContainText('Your setup read 23 of 24 cards correctly.');
  const first = kit.cards[0];
  if (!first) throw new Error('the kit has no cards');
  await expect(
    check.getByRole('row', { name: new RegExp(`${first.givenName} ${first.familyName}`) }),
  ).toContainText(`Section 3: punched ${first.scores[2]}`);
  await expect(check).toContainText('glare');
  // Let the dialog finish fading in: half-faded text fails contrast.
  await window.waitForFunction(() =>
    [...document.querySelectorAll('.mantine-Modal-content')].every(
      (el) => getComputedStyle(el).opacity === '1',
    ),
  );
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await check.getByRole('button', { name: 'Done' }).click();

  // A file that isn't a key is refused plainly.
  await pick(join(kit.dir, 'entry-list.xlsx'));
  await window.getByRole('button', { name: 'Check a test trial…' }).click();
  await expect(window.getByText(/isn't a Test trial answer key/)).toBeVisible();
});

test("the check is offered only on a Test trial event's results", async () => {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel(/^Event name/).fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await nav().getByRole('button', { name: 'Results' }).click();
  await expect(window.getByRole('heading', { name: 'Results', level: 2 })).toBeVisible();
  await expect(window.getByRole('button', { name: 'Check a test trial…' })).toHaveCount(0);
});
