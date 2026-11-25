import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// Invented riders only. Practice cards stand in for the camera.

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

async function accessible(name: string) {
  await window.mouse.move(700, 20);
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${name}: ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
}

test('a clear card is saved by itself; an unclear one goes to review and is decided there', async () => {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByLabel('Laps for Trial 3').fill('2');
  await window.getByRole('button', { name: 'Create event' }).click();
  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    'Number,Given name,Family name,Class,Club,Competition status\r\n7,Avery,Stone,Trial 3,,\r\n',
  );
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, csv);
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 1 rider' }).click();
  await expect(window.getByText('1 rider imported.')).toBeVisible();

  await nav().getByRole('button', { name: 'Scan desk' }).click();
  await expect(window.getByRole('heading', { name: 'Scan desk', level: 2 })).toBeVisible();
  await accessible('Scan desk');

  // A card with no label: find the rider by part of their name, as on the Riders screen.
  const find = window.getByLabel('Rider for a card with no label: number or name');
  await find.fill('ston');
  await window.getByRole('option', { name: /7\s*Avery Stone/ }).click();
  await expect(find).toHaveValue('7 Avery Stone');
  await expect(window.getByRole('listbox', { name: 'Matching riders' })).toHaveCount(0);
  await find.fill('');

  // A clear card, with its label: saved by itself.
  await window.getByRole('button', { name: 'Practice card', exact: true }).click();
  const lastCard = window.getByRole('log', { name: 'Last card' });
  await expect(lastCard).toContainText('Saved rider 7 lap 1:', { timeout: 10_000 });
  await expect(window.getByRole('status').first()).toHaveText('Lift the card off.');
  await window.getByRole('button', { name: 'Lift the card off' }).click();
  await expect(window.getByRole('status').first()).toHaveText('Place the next card on the mat.', {
    timeout: 5_000,
  });

  // Lap 2, with two holes in section 3: needs a look.
  await window.getByRole('button', { name: 'Practice card with an unclear row' }).click();
  const read = window.getByRole('region', { name: 'Card read' });
  await expect(read).toContainText('lap 2', { timeout: 10_000 });
  await expect(window.getByRole('status').first()).toContainText('Needs a look');
  await window.keyboard.press('Enter');
  await expect(lastCard).toContainText('Rider 7 lap 2: sent to Review queue (1 to check).');

  await nav().getByRole('button', { name: 'Review queue' }).click();
  const item = window.getByRole('region', {
    name: /Rider 7 \(Avery Stone\), Trial 3, day 1 lap 2/,
  });
  await expect(item).toContainText('Section 3: More than one hole');
  await expect(item.getByRole('img', { name: "Photo of rider 7's card" })).toBeVisible();
  await accessible('Review queue');
  await item.getByText('1', { exact: true }).last().click();
  await item.getByRole('button', { name: 'Save scores' }).click();
  await expect(window.getByText('Nothing to review.')).toBeVisible();

  // The link at the bottom goes to Manual entry.
  await window.getByRole('button', { name: 'Go to Manual entry' }).click();
  await expect(window.getByRole('heading', { name: 'Manual entry', level: 2 })).toBeVisible();

  // Both laps count in the results now.
  await nav().getByRole('button', { name: 'Results' }).click();
  await expect(window.getByText('PROVISIONAL')).toHaveCount(0);
});

test('a card is saved once, even while the save is slow', async () => {
  // The card still on the mat must not be read and saved again while its save is going (it
  // would say "already in").
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    [
      'Number,Given name,Family name,Class,Club,Competition status',
      ...Array.from({ length: 12 }, (_, i) => `${i + 1},Rider,Number${i + 1},Trial 2,Example MCC,`),
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
  await window.getByRole('button', { name: 'Import 12 riders' }).click();

  // Make every scan save take a second, longer than the quarter second between reads.
  await run.app.evaluate(({ ipcMain }) => {
    const handlers = (
      ipcMain as unknown as { _invokeHandlers: Map<string, (...a: unknown[]) => unknown> }
    )._invokeHandlers;
    const real = handlers.get('scan:save');
    if (!real) throw new Error('no scan:save handler');
    handlers.set('scan:save', async (...a: unknown[]) => {
      await new Promise((r) => setTimeout(r, 1_000));
      return real(...a);
    });
  });

  await nav().getByRole('button', { name: 'Scan desk' }).click();
  await window.getByRole('button', { name: 'Practice card', exact: true }).click();
  const lastCard = window.getByRole('log', { name: 'Last card' });
  await expect(lastCard).toContainText('Saved rider 1 lap 1:', { timeout: 10_000 });
  await window.waitForTimeout(1_500);
  await expect(window.getByText(/is already in/)).toHaveCount(0);
});
