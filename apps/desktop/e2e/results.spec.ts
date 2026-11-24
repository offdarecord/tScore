import { readFileSync, writeFileSync } from 'node:fs';
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

/** The usual classes at 10 sections × 4 laps, and four riders (one NC, one junior). */
async function eventWithRiders() {
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
      '1,Avery,Stone,Trial 3,Example MCC,',
      '2,Blake,River,Trial 3,Example MCC,',
      '3,Casey,Hill,Trial 3,,NC',
      '4,Riley,Moss,Juniors,Example MCC,',
    ].join('\r\n'),
  );
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await stubDialog('showOpenDialog', csv);
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 4 riders' }).click();
  await expect(window.getByText('4 riders imported.')).toBeVisible();
}

/** Stand in for a Windows file dialog: the desk picks this path. */
async function stubDialog(which: 'showOpenDialog' | 'showSaveDialog', path: string) {
  await run.app.evaluate(
    ({ dialog }, [kind, picked]) => {
      if (kind === 'showOpenDialog') {
        dialog.showOpenDialog = (() =>
          Promise.resolve({
            canceled: false,
            filePaths: [picked],
          })) as typeof dialog.showOpenDialog;
      } else {
        dialog.showSaveDialog = (() =>
          Promise.resolve({ canceled: false, filePath: picked })) as typeof dialog.showSaveDialog;
      }
    },
    [which, path] as const,
  );
}

async function typeCards(cards: readonly [number, string][]) {
  await nav().getByRole('button', { name: 'Manual entry' }).click();
  const rider = window.getByLabel('Rider: number or name');
  const scores = window.getByLabel('Scores, section 1 onwards');
  for (const [number, typed] of cards) {
    await rider.fill(String(number));
    await rider.press('Enter');
    await scores.fill(typed);
    await scores.press('Enter');
    await expect(window.getByText(new RegExp(`Saved rider ${number} lap`))).toBeVisible();
  }
}

const ALL_LAPS = (n: number, lap: string) =>
  Array.from({ length: 4 }, () => [n, lap] as [number, string]);

test('results rank the class, stay provisional until every card is in, and hide NC scores', async () => {
  await eventWithRiders();
  await typeCards([
    ...ALL_LAPS(1, '0000000001'), // 4
    ...ALL_LAPS(2, '0000000000'), // 0
    ...ALL_LAPS(3, '0000000000'), // 0, but non-competitive
    [4, '0102000000'], // junior: one lap in of four
  ]);

  await nav().getByRole('button', { name: 'Results' }).click();
  await expect(window.getByRole('heading', { name: 'Results', level: 2 })).toBeVisible();
  const provisional = window.getByRole('region', { name: 'Provisional' });
  await expect(provisional).toContainText('3 cards still missing. Positions may change.');
  await provisional.getByRole('button', { name: 'See what’s missing' }).click();
  await expect(provisional).toContainText('Rider 4 (Juniors): lap 2 not in yet');

  const table = window.getByRole('table', { name: 'Trial 3 results' });
  const rows = table.getByRole('row');
  await expect(rows.nth(1)).toContainText('1st2Blake River');
  await expect(rows.nth(2)).toContainText('2nd1Avery Stone');
  const nc = rows.nth(3);
  await expect(nc).toContainText('NC3Casey Hill');
  await expect(nc).toContainText('Non-competitive: scores not shown');
  // Counts only: 40 cleans, and no lap totals or total.
  await expect(nc.getByRole('cell')).toHaveText([
    'NC', '3', /Casey Hill/, '', '', '', '', '', '', '', '40', '0', '0', '0', '0',
  ]); // prettier-ignore

  await window.getByRole('tab', { name: /Juniors/ }).click();
  await expect(window.getByRole('table', { name: 'Juniors results' })).toContainText(
    'Waiting for lap 2, 3, 4',
  );
});

test('results are saved as a PDF and a CSV, with junior surnames as an initial', async () => {
  await eventWithRiders();
  await typeCards([
    [4, '0102000000'],
    [3, '0000000000'],
  ]);
  await nav().getByRole('button', { name: 'Results' }).click();

  const pdf = join(run.userData, 'results.pdf');
  await stubDialog('showSaveDialog', pdf);
  await window.getByRole('button', { name: 'Save PDF…' }).click();
  await expect(window.getByRole('status').filter({ hasText: 'Saved:' })).toContainText(pdf);
  expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-');

  const csv = join(run.userData, 'results.csv');
  await stubDialog('showSaveDialog', csv);
  await window.getByRole('button', { name: 'Save CSV…' }).click();
  await expect(window.getByRole('status').filter({ hasText: 'Saved:' })).toContainText(csv);
  const text = readFileSync(csv, 'utf8');
  expect(text).toContain('Juniors,1st,4,Riley M.,Example MCC,,3,,,,,3,');
  expect(text).not.toContain('Moss');
  // The NC rider: no lap scores, penalties or total; counts only.
  expect(text).toContain(
    [
      'Trial 3',
      'NC',
      '3',
      'Casey Hill',
      ...Array<string>(8).fill(''),
      '10',
      '0',
      '0',
      '0',
      '0',
    ].join(','),
  );

  // Untick the option: full names.
  await window.getByLabel(/Show junior riders' surnames as an initial/).uncheck();
  await window.getByRole('button', { name: 'Save CSV…' }).click();
  await expect(window.getByRole('status').filter({ hasText: 'Saved:' })).toBeVisible();
  expect(readFileSync(csv, 'utf8')).toContain('Riley Moss');
});

test('the Results screen meets WCAG 2.2 AA (automated check)', async () => {
  await eventWithRiders();
  await typeCards([[1, '0000000001']]);
  await nav().getByRole('button', { name: 'Results' }).click();
  await window.getByRole('button', { name: 'See what’s missing' }).click();
  // The smallest window tScore allows, so the table has to scroll sideways (as on CI).
  await window.setViewportSize({ width: 1024, height: 700 });
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
