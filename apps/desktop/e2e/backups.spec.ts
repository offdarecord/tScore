import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function pick(path: string) {
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, path);
}

test('backups are made, copied to a second place, and restored as a new event', async () => {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  const folder = join(run.eventsDir, '2027-02-06 ECT');

  // Back up now, then choose a second place: a backup is copied there too.
  const card = window.getByRole('region', { name: 'Saving and backup' });
  await expect(card).toContainText(folder);
  await card.getByRole('button', { name: 'Back up now' }).click();
  await expect(card.getByRole('status')).toHaveText('Backup made.');
  const manual = readdirSync(join(folder, 'backups')).filter((f) => f.endsWith('-manual.sqlite'));
  expect(manual).toHaveLength(1);

  const usb = mkdtempSync(join(tmpdir(), 'tscore-usb-'));
  await pick(usb);
  await card.getByRole('button', { name: 'Choose second copy…' }).click();
  await expect(card).toContainText(`Every backup is also copied to ${usb}.`);
  expect(readdirSync(join(usb, 'tScore backups', '2027-02-06 ECT')).length).toBeGreaterThan(0);

  // A change, then closing the event, makes an automatic backup.
  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    'Number,Given name,Family name,Class,Club,Competition status\r\n1,Avery,Stone,Trial 3,,\r\n',
  );
  await pick(csv);
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 1 rider' }).click();
  await expect(window.getByText('1 rider imported.')).toBeVisible();
  await nav().getByRole('button', { name: '← All events' }).click();
  await expect(window.getByRole('heading', { name: 'Recent events' })).toBeVisible();
  await expect
    .poll(
      () => readdirSync(join(folder, 'backups')).filter((f) => f.endsWith('-auto.sqlite')).length,
    )
    .toBe(1);

  // Restore the first backup (before the rider): it opens as a new event folder.
  await pick(join(folder, 'backups', manual[0] ?? ''));
  await window.getByRole('button', { name: 'Restore from backup…' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  const restored = window.getByRole('region', { name: 'Saving and backup' });
  await expect(restored).toContainText('2027-02-06 ECT restored');
  await expect(nav().getByRole('button', { name: /Riders/ })).toHaveText('Riders');
  // The original is still there, with its rider.
  expect(existsSync(join(folder, 'event.sqlite'))).toBe(true);
  expect(readdirSync(run.eventsDir).filter((f) => f.includes('restored'))).toHaveLength(1);
});

test("restoring a file that isn't a backup says so, and changes nothing", async () => {
  const junk = join(run.userData, 'not-a-backup.sqlite');
  writeFileSync(junk, 'this is not a database');
  await pick(junk);
  await window.getByRole('button', { name: 'Restore from backup…' }).click();
  const alert = window.getByRole('alert').filter({ hasText: "The event didn't open" });
  await expect(alert).toContainText('TS-DB-003');
  expect(existsSync(run.eventsDir) ? readdirSync(run.eventsDir) : []).toEqual([]);
});

test('an event saved for another laptop opens there with its riders, as a new folder', async () => {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    'Number,Given name,Family name,Class,Club,Competition status\r\n1,Avery,Stone,Trial 3,,\r\n',
  );
  await pick(csv);
  await nav()
    .getByRole('button', { name: /Riders/ })
    .click();
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await window.getByRole('button', { name: 'Import 1 rider' }).click();
  await expect(window.getByText('1 rider imported.')).toBeVisible();

  const file = join(mkdtempSync(join(tmpdir(), 'tscore-usb-')), 'Example.tscore');
  await run.app.evaluate(({ dialog }, saveTo) => {
    dialog.showSaveDialog = (() =>
      Promise.resolve({ canceled: false, filePath: saveTo })) as typeof dialog.showSaveDialog;
  }, file);
  await nav().getByRole('button', { name: 'Event setup' }).click();
  const card = window.getByRole('region', { name: 'Saving and backup' });
  await card.getByRole('button', { name: 'Save a copy for another laptop…' }).click();
  await expect(card.getByRole('status')).toContainText(`Saved and checked: ${file}`);
  expect(existsSync(file)).toBe(true);

  // "The other laptop": a fresh copy of tScore with its own folders.
  await run.app.close();
  run = await launchApp();
  ({ window } = run);
  await pick(file);
  await window.getByRole('button', { name: 'Open event file…' }).click();
  await expect(nav().getByRole('button', { name: /Riders/ })).toHaveText('Riders1');
  expect(readdirSync(run.eventsDir)).toEqual(['2027-02-06 ECT']);
});
