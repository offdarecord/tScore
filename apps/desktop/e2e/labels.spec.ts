import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
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

async function importRiders(rows: readonly string[]) {
  const csv = join(run.userData, `riders-${rows.length}.csv`);
  writeFileSync(
    csv,
    ['Number,Given name,Family name,Class,Club,Competition status', ...rows].join('\r\n'),
  );
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await stubDialog('showOpenDialog', csv);
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: /^Import \d+ riders?$/ }).click();
}

/** The usual classes at 10 sections × 4 laps (juniors too), with three riders and a minder. */
async function eventWithRiders() {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  await importRiders([
    '1,Avery,Stone,Trial 3,Example MCC,',
    '2,Blake,River,Trial 3,Example MCC,NC',
    '3,Riley,Moss,Juniors,Example MCC,',
    '4,Drew,Field,Minder,,',
  ]);
  await expect(window.getByText('4 riders imported.')).toBeVisible();
  await nav().getByRole('button', { name: 'Card labels' }).click();
  await expect(window.getByRole('heading', { name: 'Card labels', level: 2 })).toBeVisible();
}

const documentXml = (path: string) =>
  strFromU8(unzipSync(readFileSync(path))['word/document.xml'] ?? new Uint8Array());

test('labels follow the event setup, save as a Word document, and remember what was printed', async () => {
  await eventWithRiders();
  await expect(window.getByText('12 labels on 1 sheet for 3 riders.')).toBeVisible();
  await expect(window.getByText("Minders don't get labels.")).toBeVisible();
  // Minders are left out by default. Unticking says why none print: their class has no laps.
  const leaveOut = window.getByLabel('Leave out minders');
  await expect(leaveOut).toBeChecked();
  await leaveOut.uncheck();
  await window.getByRole('button', { name: 'Show who' }).click();
  await expect(window.getByText('4 Drew Field: Minder has no laps in the event setup')).toBeVisible();
  await leaveOut.check();
  await expect(window.getByText("Minders don't get labels.")).toBeVisible();
  const preview = window.getByRole('region', { name: 'Label preview, scrolls sideways' });
  await expect(preview.getByRole('img', { name: 'Rider 1, lap 4' })).toBeVisible();
  await expect(preview.getByRole('img', { name: 'Rider 2, lap 1' })).toContainText('Trial 3 · NC');

  const docx = join(run.userData, 'labels.docx');
  await stubDialog('showSaveDialog', docx);
  await window.getByRole('button', { name: 'Save Word document…' }).click();
  await expect(window.getByRole('status').filter({ hasText: '12 labels saved' })).toBeVisible();
  const xml = documentXml(docx);
  expect(xml).toContain('Riley Moss');
  expect(xml).not.toContain('Drew Field');
  await expect(window.getByLabel('Only labels not printed yet (0)')).toBeVisible();

  // A late entry: only their labels are left to print.
  await importRiders(['5,Gray,Lake,Trial 3,,']);
  await nav().getByRole('button', { name: 'Card labels' }).click();
  await window.getByLabel('Only labels not printed yet (4)').check();
  await expect(window.getByText('4 labels on 1 sheet for 1 rider.')).toBeVisible();

  // Start part-way into a used sheet: the first positions are left blank.
  await window.getByLabel('Start at label').fill('7');
  await expect(window.getByText('4 labels on 1 sheet for 1 rider.')).toBeVisible();
  const late = join(run.userData, 'late.docx');
  await stubDialog('showSaveDialog', late);
  await window.getByRole('button', { name: 'Save Word document…' }).click();
  await expect(window.getByRole('status').filter({ hasText: '4 labels saved' })).toBeVisible();
  expect(documentXml(late)).toContain('Gray Lake');
  expect(documentXml(late)).not.toContain('Avery Stone');
  await expect(window.getByLabel('Only labels not printed yet (0)')).toBeVisible();

  // The late entry fixes a typo in their name: the desk is reminded to reprint, and does.
  await nav().getByRole('button', { name: /Riders/ }).click();
  await window.getByRole('button', { name: 'Change rider 5' }).click();
  await window.getByRole('dialog').getByLabel('Surname').fill('Lakes');
  await window.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(window.getByRole('status').filter({ hasText: "Reprint rider 5's labels" })).toBeVisible();
  await nav().getByRole('button', { name: 'Card labels' }).click();
  await window.getByLabel('One rider (reprint)').check();
  await window.getByLabel('Rider number').fill('5');
  const reprint = join(run.userData, 'reprint.docx');
  await stubDialog('showSaveDialog', reprint);
  await window.getByRole('button', { name: 'Save Word document…' }).click();
  await expect(window.getByRole('status').filter({ hasText: '4 labels saved' })).toBeVisible();
  expect(documentXml(reprint)).toContain('Gray Lakes');
}); // prettier-ignore

test('the alignment test page and printer offset', async () => {
  await eventWithRiders();
  const test = join(run.userData, 'test.docx');
  await stubDialog('showSaveDialog', test);
  await window.getByRole('button', { name: 'Save alignment test page…' }).click();
  await expect(
    window.getByRole('status').filter({ hasText: 'Alignment test page saved' }),
  ).toBeVisible();
  expect(documentXml(test)).toContain('w:val="dotted"');

  await window.getByLabel('Move right (mm)').fill('1.5');
  await window.getByLabel('Move down (mm)').fill('-0.5');
  await window.getByRole('button', { name: 'Save offset' }).click();
  await expect(window.getByText('Saved for this laptop.')).toBeVisible();
  const moved = join(run.userData, 'moved.docx');
  await stubDialog('showSaveDialog', moved);
  await window.getByRole('button', { name: 'Save Word document…' }).click();
  await expect(window.getByRole('status').filter({ hasText: '12 labels saved' })).toBeVisible();
  // 4.7 + 1.5 mm across and 10.7 − 0.5 mm down, in twentieths of a point.
  const xml = documentXml(moved);
  expect(xml).toContain(`w:left="${Math.round(6.2 * 56.6929)}"`);
  expect(xml).toContain(`w:top="${Math.round(10.2 * 56.6929)}"`);
});

test('the Card labels screen meets WCAG 2.2 AA (automated check)', async () => {
  await eventWithRiders();
  // Move the mouse off the nav button just clicked, so its hover colour isn't what's checked.
  await window.mouse.move(700, 20);
  // The smallest window tScore allows, so the preview has to scroll sideways (as on CI).
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
