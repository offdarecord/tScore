import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// Invented riders only. The event is today, starting at midnight, with cards handed in at
// 00:10 and 00:20, so the test needs the clock to be well past that.

let run: Launched;
let window: Page;

test.beforeEach(async () => {
  test.skip(new Date().getHours() < 2, 'needs the local time to be after 02:00');
  run = await launchApp();
  ({ window } = run);
});

test.afterEach(async () => {
  await run?.app.close();
});

const nav = () => window.getByRole('navigation', { name: 'Event' });
const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

async function eventToday() {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel('Date', { exact: true }).fill(today());
  await window.getByLabel('Lap 1 starts').fill('00:00');
  await window.getByLabel('Laps for Trial 3').fill('2');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();

  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    [
      'Number,Given name,Family name,Class,Club,Competition status',
      '1,Avery,Stone,Trial 3,,',
      '2,Blake,River,Trial 3,,',
      '3,Casey,Hill,Trial 3,,',
      '4,Drew,Field,Minder,,',
    ].join('\r\n'),
  );
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, csv);
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 4 riders' }).click();
  await expect(window.getByText('4 riders imported.')).toBeVisible();
}

/** Type cards on Manual entry: rider, lap, the time it was handed in. */
async function typeCards(cards: readonly [number, number, string][]) {
  await nav().getByRole('button', { name: 'Manual entry' }).click();
  const rider = window.getByLabel('Rider: number or name');
  for (const [number, lap, time] of cards) {
    await rider.fill(String(number));
    await rider.press('Enter');
    await window.getByLabel('Lap', { exact: true }).selectOption(String(lap));
    await window.getByLabel('Card in at').fill(time);
    const scores = window.getByLabel('Scores, section 1 onwards');
    await scores.fill('0000000000');
    await scores.press('Enter');
    await expect(window.getByText(new RegExp(`Saved rider ${number} lap ${lap}`))).toBeVisible();
  }
}

test('who is overdue and still on course follows the cards in, with Mark DNF and Undo', async () => {
  await eventToday();
  // Trial 3 laps take 10 minutes (rider 1), so riders 2 and 3 are long overdue.
  await typeCards([
    [1, 1, '00:10'],
    [1, 2, '00:20'],
    [2, 1, '00:10'],
  ]);

  await nav().getByRole('button', { name: 'Progress' }).click();
  await expect(window.getByRole('heading', { name: 'Progress', level: 2 })).toBeVisible();
  const overdue = window.getByRole('region', { name: 'Overdue riders' });
  await expect(overdue).toContainText('Rider 2');
  await expect(overdue).toContainText('no lap 2 card');
  await expect(overdue).toContainText('Rider 3');
  await expect(overdue).toContainText('Trial 3 laps average 10 min');
  await expect(window.getByText('3 of 6')).toBeVisible();

  // Mark rider 3 DNF, undo it, then mark again.
  const row3 = overdue
    .locator('div')
    .filter({ hasText: /^Rider 3/ })
    .first();
  await row3.getByRole('button', { name: 'Mark DNF…' }).click();
  await row3.getByRole('button', { name: 'Mark DNF', exact: true }).click();
  await expect(
    window.getByRole('status').filter({ hasText: 'Rider 3 (Casey Hill) marked DNF' }),
  ).toBeVisible();
  await window.getByRole('button', { name: 'Undo' }).click();
  await expect(overdue).toContainText('Rider 3');
  await row3.getByRole('button', { name: 'Mark DNF…' }).click();
  await row3.getByRole('button', { name: 'Mark DNF', exact: true }).click();
  await expect(overdue).not.toContainText('Rider 3');

  // Still on course: only rider 2 is out.
  await nav().getByRole('button', { name: 'Still on course' }).click();
  const onCourse = window.getByRole('region', { name: 'Riders on course', exact: true });
  await expect(onCourse).toContainText('Blake River');
  await expect(onCourse).toContainText('Lap 1 at');
  await expect(onCourse).toContainText('overdue');
  await expect(onCourse).not.toContainText('Avery Stone');
  const board = window.getByRole('list', { name: "Every rider's state" });
  await expect(board.getByRole('img', { name: 'Rider 1: final card in' })).toBeVisible();
  await expect(board.getByRole('img', { name: 'Rider 2: on course' })).toBeVisible();
  await expect(board.getByRole('img', { name: 'Rider 3: did not finish' })).toBeVisible();
  await expect(board.getByRole('img', { name: /Rider 4/ })).toHaveCount(0); // minder

  // Rider 2's last card comes in: everyone is accounted for.
  await typeCards([[2, 2, '00:25']]);
  await nav().getByRole('button', { name: 'Still on course' }).click();
  await expect(window.getByText('Everyone is accounted for.', { exact: false })).toBeVisible();
});

test('the Progress and Still on course screens meet WCAG 2.2 AA (automated check)', async () => {
  await eventToday();
  await typeCards([[1, 1, '00:10']]);
  for (const page of ['Progress', 'Still on course']) {
    await nav().getByRole('button', { name: page }).click();
    await expect(window.getByRole('heading', { name: page, level: 2 })).toBeVisible();
    await window.mouse.move(700, 20);
    await window.setViewportSize({ width: 1024, height: 700 });
    const results = await new AxeBuilder({ page: window })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map(
        (v) => `${page}: ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
      ),
    ).toEqual([]);
  }
});
