import { writeFileSync } from 'node:fs';
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

/** A new event (the usual classes, 10 sections × 4 laps) with three riders, at Manual entry. */
async function eventAtManualEntry() {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel('Date', { exact: true }).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();

  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    'Number,Given name,Family name,Class\r\n17,Sam,Specimen,Trial 3\r\n21,Jamie,Sample,Trial 4\r\n23,Alex,Instance,Trial 4\r\n',
  );
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, csv);
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 3 riders' }).click();
  await expect(window.getByText('3 riders imported.')).toBeVisible();

  await nav().getByRole('button', { name: 'Manual entry' }).click();
  await expect(window.getByRole('heading', { name: 'Manual entry', level: 2 })).toBeVisible();
}

test('a card is typed in with the keyboard alone, checked as it is typed, and saved', async () => {
  await eventAtManualEntry();
  const rider = window.getByLabel('Rider: number or name');
  const scores = window.getByLabel('Scores, section 1 onwards');

  await rider.fill('17');
  await rider.press('Enter');
  await expect(window.getByLabel('Lap', { exact: true })).toHaveValue('1');
  await expect(scores).toBeFocused();

  await scores.fill('0104');
  await expect(window.getByText("4 isn't a score (section 4). Use 0, 1, 2, 3 or 5.")).toBeVisible();
  await expect(window.getByRole('button', { name: /Save card/ })).toBeDisabled();
  await scores.fill('01020');
  await expect(window.getByText('5 sections still to type.')).toBeVisible();
  await scores.fill('0102530010');
  await expect(window.getByTestId('card-preview')).toContainText('Lap total12');
  await scores.press('Enter');

  await expect(window.getByRole('status').filter({ hasText: 'Saved rider 17 lap 1' })).toHaveText(
    '✓ Saved rider 17 lap 1: total 12. Next card.',
  );
  await expect(rider).toBeFocused();
  const earlier = window.getByRole('region', { name: 'Earlier cards' });
  await expect(earlier.getByRole('row').nth(1)).toContainText('1710102530010');
  await expect(earlier.getByRole('row').nth(1)).toContainText('Typed');

  // The next card for the same rider goes to lap 2.
  await rider.fill('Spec');
  await window.getByRole('option', { name: /17 Sam Specimen/ }).click();
  await expect(window.getByLabel('Lap', { exact: true })).toHaveValue('2');

  // Typing a lap that's already in offers to edit it instead.
  await window.getByLabel('Lap', { exact: true }).selectOption('1');
  await expect(window.getByText('Lap 1 for rider 17 is already in.')).toBeVisible();
  await window.getByRole('button', { name: 'Edit that card instead' }).click();
  await expect(window.getByText(/Editing an earlier card: rider 17, lap 1/)).toBeVisible();
  await scores.fill('0102530015');
  await window.getByRole('button', { name: /Save change/ }).click();
  await expect(window.getByText('✓ Changed rider 17 lap 1: total now 17.')).toBeVisible();
  await expect(earlier.getByRole('row').nth(1)).toContainText('Edited');

  // Saved for good: still there after a restart.
  await run.app.close();
  run = await launchApp(run);
  ({ window } = run);
  await window.getByRole('button', { name: 'Open Example Club Trial' }).click();
  await nav().getByRole('button', { name: 'Manual entry' }).click();
  await expect(
    window.getByRole('region', { name: 'Earlier cards' }).getByRole('row').nth(1),
  ).toContainText('0102530015');
});

test('a penalty is added and removed on Manual entry', async () => {
  await eventAtManualEntry();
  await window.getByLabel('Rider: number or name').fill('21');
  await window.getByLabel('Rider: number or name').press('Enter');
  await window.getByRole('button', { name: 'Add penalty…' }).click();
  const form = window.getByRole('region', { name: 'Add penalty' });
  await expect(form.getByRole('button', { name: 'Save penalty' })).toBeDisabled();
  await form.getByLabel('Points').fill('5');
  await form.getByLabel('Reason').selectOption('dissent');
  await form.getByRole('button', { name: 'Save penalty' }).click();
  await expect(window.getByText('✓ Penalty of 5 added for rider 21.')).toBeVisible();
  const list = window.getByRole('region', { name: 'Penalties for this rider' });
  await expect(list).toContainText('+5 · Dissent / arguing with an observer · lap 1');

  // "Other" needs a few words saying what for.
  await window.getByRole('button', { name: 'Add penalty…' }).click();
  await form.getByLabel('Points').fill('10');
  await form.getByLabel('Reason').selectOption('other');
  await expect(form.getByRole('button', { name: 'Save penalty' })).toBeDisabled();
  await form.getByLabel('What for').fill('Riding the course before the start');
  await form.getByRole('button', { name: 'Save penalty' }).click();
  await expect(list).toContainText('+10 · Other (Riding the course before the start)');

  await list.getByRole('button', { name: 'Remove penalty of 5' }).click();
  await expect(list).not.toContainText('+5');
  await expect(window.getByText('✓ Penalty removed for rider 21. Logged.')).toBeVisible();
});

test('the Manual entry screen meets WCAG 2.2 AA (automated check)', async () => {
  await eventAtManualEntry();
  await window.getByLabel('Rider: number or name').fill('23');
  await window.getByLabel('Rider: number or name').press('Enter');
  await window.getByLabel('Scores, section 1 onwards').fill('01');
  await window.getByRole('button', { name: 'Add penalty…' }).click();
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
