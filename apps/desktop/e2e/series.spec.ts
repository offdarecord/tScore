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

async function stub(kind: 'showOpenDialog' | 'showSaveDialog', path: string) {
  await run.app.evaluate(
    ({ dialog }, [k, picked]) => {
      if (k === 'showOpenDialog') {
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
    [kind, path] as const,
  );
}

/** A one-lap round with two riders, typed in and marked final (or left provisional). */
async function round(name: string, date: string, cards: [number, string][], final = true) {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill(name);
  await window.getByLabel('Date', { exact: true }).fill(date);
  await window.getByLabel('Laps for Trial 3').fill('1');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    [
      'Number,Given name,Family name,Class,Club,Competition status',
      '1,Avery,Stone,Trial 3,,',
      '2,Blake,River,Trial 3,,',
    ].join('\r\n'),
  );
  await stub('showOpenDialog', csv);
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 2 riders' }).click();
  await expect(window.getByText('2 riders imported.')).toBeVisible();
  for (const [number, scores] of cards) {
    await nav().getByRole('button', { name: 'Manual entry' }).click();
    const rider = window.getByLabel('Rider: number or name');
    await rider.fill(String(number));
    await rider.press('Enter');
    const box = window.getByLabel('Scores, section 1 onwards');
    await box.fill(scores);
    await box.press('Enter');
    await expect(window.getByText(new RegExp(`Saved rider ${number} lap 1`))).toBeVisible();
  }
  if (final) {
    await nav().getByRole('button', { name: 'Results' }).click();
    await window.getByRole('button', { name: 'Mark results final…' }).click();
    await window.getByRole('dialog').getByRole('button', { name: 'Mark final' }).click();
    await expect(window.getByRole('region', { name: 'Final results' })).toBeVisible();
  }
  await nav().getByRole('button', { name: '← All events' }).click();
}

test('a series adds up final rounds, leaves out rounds not final, and saves a CSV', async () => {
  await round('Winter Round 1', '2027-05-01', [
    [1, '0000000000'],
    [2, '0000000001'],
  ]);
  await round('Winter Round 2', '2027-06-05', [
    [1, '0000000005'],
    [2, '0000000000'],
  ]);
  await round('Winter Round 3', '2027-07-03', [[1, '0000000000']], false);

  await window.getByRole('button', { name: 'Series points' }).click();
  await window.getByLabel('Series name').fill('Winter Series 2027');
  await window.getByRole('button', { name: 'Make series' }).click();
  await expect(window.getByRole('heading', { name: 'Winter Series 2027', level: 2 })).toBeVisible();

  const add = window.getByLabel('Add a round from your events');
  for (const name of ['Winter Round 2', 'Winter Round 1', 'Winter Round 3']) {
    await add.selectOption({ label: await add.locator('option', { hasText: name }).innerText() });
    await window.getByRole('button', { name: 'Add round' }).click();
    await expect(window.getByText(new RegExp(`^Round \\d: ${name}`))).toBeVisible();
  }
  // Numbered by date, whatever order they were added in.
  await expect(window.getByText('Round 1: Winter Round 1')).toBeVisible();
  await expect(window.getByText('Round 3: Winter Round 3')).toBeVisible();
  await expect(window.getByRole('status')).toContainText(
    'Round 3 (Winter Round 3): results not final yet',
  );

  // Avery 25 + 22 = 47, Blake 22 + 25 = 47: equal totals share 1st.
  const tally = window.getByRole('region', { name: /Points after 2 rounds/ });
  const avery = tally.getByRole('row', { name: /Avery Stone/ });
  await expect(avery).toContainText('1=');
  await expect(avery).toContainText('47');
  await window.getByLabel('Equal totals').selectOption('split');
  // One win each; Blake won the latest round.
  await expect(
    tally
      .getByRole('row', { name: /Blake River/ })
      .getByRole('cell')
      .first(),
  ).toHaveText('1');
  await expect(avery.getByRole('cell').first()).toHaveText('2');

  const file = join(run.userData, 'series.csv');
  await stub('showSaveDialog', file);
  await window.getByRole('button', { name: 'Save CSV…' }).click();
  await expect(window.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  const csv = readFileSync(file, 'utf8');
  expect(csv).toContain('Trial 3,1,Blake River,2,,22,25,47');

  await window.mouse.move(700, 20);
  const axe = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
});
