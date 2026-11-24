import { existsSync, writeFileSync } from 'node:fs';
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

/** Trial 3 at one lap, two riders. */
async function smallEvent() {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel('Date', { exact: true }).fill('2027-02-06');
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
  await stubDialog('showOpenDialog', csv);
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 2 riders' }).click();
  await expect(window.getByText('2 riders imported.')).toBeVisible();
}

async function typeCard(number: number, scores: string, edit = false) {
  await nav().getByRole('button', { name: 'Manual entry' }).click();
  const rider = window.getByLabel('Rider: number or name');
  await rider.fill(String(number));
  await rider.press('Enter');
  if (edit) await window.getByRole('button', { name: 'Edit that card instead' }).click();
  const box = window.getByLabel('Scores, section 1 onwards');
  await box.fill(scores);
  await box.press('Enter');
}

test('results are marked final, reopened with a reason, and revised', async () => {
  await smallEvent();
  await typeCard(1, '0000000000');
  await expect(window.getByText(/Saved rider 1 lap 1/)).toBeVisible();
  await typeCard(2, '0000000001');
  await expect(window.getByText(/Saved rider 2 lap 1/)).toBeVisible();

  await nav().getByRole('button', { name: 'Results' }).click();
  await window.getByRole('button', { name: 'Mark results final…' }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Mark final' }).click();
  const final = window.getByRole('region', { name: 'Final results' });
  await expect(final).toContainText('FINAL');
  await expect(final).not.toContainText('REVISION');

  // Nothing that affects results can change while they're final.
  await typeCard(1, '5555555555', true);
  await expect(window.getByRole('alert')).toContainText('STORE_RESULTS_FINAL');

  // Reopen, correct rider 1's card (they drop to 2nd), and issue revision 2.
  await nav().getByRole('button', { name: 'Results' }).click();
  await final.getByRole('button', { name: 'Reopen…' }).click();
  const reopen = window.getByRole('dialog', { name: 'Reopen revision 1' });
  await expect(reopen.getByRole('button', { name: 'Reopen results' })).toBeDisabled();
  await reopen.getByLabel('Why are the results being reopened?').fill('Rider 1 card misread');
  await reopen.getByRole('button', { name: 'Reopen results' }).click();
  const panel = window.getByRole('region', { name: 'Mark results final' });
  await expect(panel).toContainText('Revision 1 reopened: Rider 1 card misread');
  await expect(panel).toContainText('No places have changed');

  await typeCard(1, '5555555555', true);
  await expect(window.getByText(/Changed rider 1 lap 1/)).toBeVisible();
  await nav().getByRole('button', { name: 'Results' }).click();
  await expect(panel).toContainText('Trial 3: rider 1, 1st → 2nd');
  await expect(panel).toContainText('Trial 3: rider 2, 2nd → 1st');
  await panel.getByRole('button', { name: 'Mark results final (revision 2)…' }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Mark final' }).click();
  await expect(final).toContainText('FINAL · REVISION 2');

  // The saved file is named FINAL rev 2 by default (we accept the suggested name).
  await run.app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = ((_w: unknown, o?: Electron.SaveDialogOptions) =>
      Promise.resolve({
        canceled: false,
        filePath: (o ?? (_w as Electron.SaveDialogOptions)).defaultPath,
      })) as typeof dialog.showSaveDialog;
  });
  await window.getByRole('button', { name: 'Save PDF…' }).click();
  const saved = window.getByRole('status').filter({ hasText: 'Saved:' });
  await expect(saved).toContainText('ECT results FINAL rev 2 2027-02-06.pdf');
  const path = (await saved.textContent())
    ?.replace(/^Saved: /, '')
    .replace(/Open$/, '')
    .trim();
  expect(path && existsSync(path)).toBe(true);
});

test('the final results panel meets WCAG 2.2 AA (automated check)', async () => {
  await smallEvent();
  await typeCard(1, '0000000000');
  await expect(window.getByText(/Saved rider 1 lap 1/)).toBeVisible();
  await typeCard(2, '0000000001');
  await expect(window.getByText(/Saved rider 2 lap 1/)).toBeVisible();
  await nav().getByRole('button', { name: 'Results' }).click();
  await window.getByRole('button', { name: 'Mark results final…' }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Mark final' }).click();
  await expect(window.getByRole('region', { name: 'Final results' })).toBeVisible();
  await window.mouse.move(700, 20);
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
