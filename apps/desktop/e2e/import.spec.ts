import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { launchApp, type Launched } from './app';

// Synthetic entry lists: the entry systems' real column names, invented people. Never use a
// real export here.

let run: Launched;
let window: Page;

test.beforeEach(async () => {
  run = await launchApp();
  ({ window } = run);
});

test.afterEach(async () => {
  await run?.app.close();
});

const RIDERNET = [
  ['registrationDate', 'First_Name', 'Last_Name', 'RidernetID', 'DOB', 'Phone', 'Emergency_Contact_Name', 'Event_Role', 'Event_Class_Name', 'Class_Reg_Status', 'Licence_Type', 'Club', 'Riding_Number', 'Bike_Make', 'Bike_Model', 'Bike_VIN'],
  ["{ts '2027-01-02 10:00:00'}", 'Avery', 'Stone', '900001', '01/01/1990', '0400 000 001', 'Contact One', 'Rider', 'Trial 4', 'Active', 'SRN', 'Example Trials Club', '1234', 'Beta', 'Evo 300', 'VIN0000000001'],
  ["{ts '2027-01-02 10:01:00'}", 'Blake', 'River', '900002', '02/02/2012', '0400 000 002', 'Contact Two', 'Rider', 'Trial 4', 'Active', 'JRN', 'Example Trials Club', 'Blake', 'GasGas', 'GasGas TXT 125', 'VIN0000000001'],
  ["{ts '2027-01-02 10:02:00'}", 'Casey', 'Hill', '900003', '03/03/1985', '0400 000 003', 'Contact Three', 'Rider', 'Trial 4 Plus', 'Active', 'SRN', 'Example Trials Club', '', 'Montesa', '4Ride', 'VIN0000000001'],
  ["{ts '2027-01-02 10:03:00'}", 'Casey', 'Hill', '900003', '03/03/1985', '0400 000 003', 'Contact Three', 'Rider', 'Trial 4', 'Active', 'SRN', 'Example Trials Club', '', 'Montesa', '4Ride', 'VIN0000000001'],
  ["{ts '2027-01-02 10:04:00'}", 'Drew', 'Field', '900004', '04/04/1975', '0400 000 004', 'Contact Four', 'Rider', 'TMTC Minder', 'Active', 'SRN', 'Example Trials Club', '0', '', '', ''],
  ["{ts '2027-01-02 10:05:00'}", 'Emery', 'Lake', '900005', '05/05/1970', '0400 000 005', 'Contact Five', 'Crew', 'Trial 2', '', 'SRN', 'Example Trials Club', '', '', '', ''],
  ["{ts '2027-01-02 10:06:00'}", 'Gray', 'Moss', '900007', '07/07/1995', '0400 000 007', 'Contact Seven', 'Rider', 'Trial 5', 'Active', 'OREC', '', '', '', '', ''],
  ["{ts '2027-01-02 10:07:00'}", 'Harper', 'Vale', '900008', '08/08/1965', '0400 000 008', 'Contact Eight', 'Rider', 'Twinshock', 'Active', 'SNA', 'Example Trials Club', '', '', '', ''],
]; // prettier-ignore

function writeRidernet(): string {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(RIDERNET), 'Sheet1');
  const path = join(run.userData, 'eventRiders-1-2027-01-03.xls');
  writeFileSync(path, XLSX.write(book, { type: 'buffer', bookType: 'biff8' }) as Buffer);
  return path;
}

/** Stand in for the Windows file dialog: the desk picks this file. */
async function pick(path: string) {
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, path);
}

async function newEventAtRiders() {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  await window
    .getByRole('navigation', { name: 'Event' })
    .getByRole('button', { name: 'Riders' })
    .click();
  await expect(window.getByRole('heading', { name: 'Riders', level: 2 })).toBeVisible();
}

async function importRidernet() {
  await pick(writeRidernet());
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await expect(window.getByRole('heading', { name: 'Import riders' })).toBeVisible();
}

test('a Ridernet export is checked, matched and imported, without personal details', async () => {
  await newEventAtRiders();
  await expect(window.getByText('No riders yet.')).toBeVisible();
  await importRidernet();

  await expect(window.getByText('✓ Recognised: Ridernet export')).toBeVisible();
  const fromFile = window.getByRole('region', { name: 'From this file' });
  await expect(fromFile).toContainText('8 rows read');
  await expect(fromFile).toContainText('1 minders skipped');
  await expect(fromFile).toContainText('1 crew skipped');

  // Twinshock isn't one of this event's classes; Casey is entered twice.
  const importButton = window.getByRole('button', { name: /^Import \d+ riders?$/ });
  await expect(importButton).toBeDisabled();
  await window.getByLabel('Event class for Twinshock').selectOption('Trial 4');
  await window.getByRole('radio', { name: 'Only Trial 4', exact: true }).check();

  const preview = window.getByRole('table', { name: 'New riders' });
  await expect(preview).toContainText('Moss');
  await expect(importButton).toHaveText('Import 5 riders');
  await expect(importButton).toBeEnabled();
  await importButton.click();

  await expect(window.getByRole('status')).toHaveText('5 riders imported.');
  await expect(window.getByText('5 riders.')).toBeVisible();
  const list = window.getByRole('region', { name: 'Rider list' });
  // Numbered by class order (Trial 4, then Trial 5), then surname.
  await expect(list.getByRole('row').nth(1)).toContainText('1Casey Hill');
  await expect(list.getByRole('row', { name: /Gray Moss/ })).toContainText('NC');
  await expect(list).not.toContainText('0400');
  await expect(list.getByRole('row', { name: /Avery Stone/ })).toContainText('Beta Evo 300');
  await expect(list.getByRole('row', { name: /Blake River/ })).toContainText('GasGas TXT 125');
  await expect(list).not.toContainText('VIN0000000001');

  // The class match was saved as an alias in the event's setup.
  await window.getByRole('navigation', { name: 'Event' }).getByRole('button', { name: 'Event setup' }).click();
  await window.getByRole('navigation', { name: 'Event' }).getByRole('button', { name: /Riders/ }).click();

  // Importing the same file again adds no one.
  await importRidernet();
  await expect(window.getByRole('region', { name: 'From this file' })).toContainText(
    '5 riders already in this event',
  );
  await expect(window.getByText('No new riders to add.')).toBeVisible();
  await expect(window.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
}); // prettier-ignore

test('the desk can change a rider’s competition status and class, and it is kept', async () => {
  await newEventAtRiders();
  await importRidernet();
  await window.getByLabel('Event class for Twinshock').selectOption('Trial 4');
  await window.getByRole('radio', { name: 'Only Trial 4', exact: true }).check();
  await window.getByRole('button', { name: 'Import 5 riders' }).click();

  await window.getByRole('button', { name: 'Change rider 2' }).click();
  const dialog = window.getByRole('dialog');
  await dialog.getByLabel('Competition status').selectOption('No award');
  await dialog.getByLabel('Class', { exact: true }).selectOption('Trial 3');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await run.app.close();
  run = await launchApp(run);
  ({ window } = run);
  await window.getByRole('button', { name: 'Open Example Club Trial' }).click();
  await window.getByRole('navigation', { name: 'Event' }).getByRole('button', { name: /Riders/ }).click();
  const row = window.getByRole('row', { name: /^2 / });
  await expect(row).toContainText('NA');
  await expect(row).toContainText('Trial 3');
}); // prettier-ignore

test('the desk corrects a rider’s name, club and machine, and it is kept', async () => {
  await newEventAtRiders();
  await importRidernet();
  await window.getByLabel('Event class for Twinshock').selectOption('Trial 4');
  await window.getByRole('radio', { name: 'Only Trial 4', exact: true }).check();
  await window.getByRole('button', { name: 'Import 5 riders' }).click();

  const before = window.getByRole('row', { name: /Avery Stone/ });
  const number = (await before.getByRole('cell').first().innerText()).trim();
  await before.getByRole('button', { name: /Change rider/ }).click();
  const dialog = window.getByRole('dialog');
  await expect(dialog.getByLabel('Machine')).toHaveValue('Beta Evo 300');
  await dialog.getByLabel('First name').fill('');
  await dialog.getByLabel('Surname').fill('');
  await expect(dialog.getByRole('alert')).toContainText('needs a first name or a surname');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog.getByLabel('First name').fill('Averie');
  await dialog.getByLabel('Surname').fill('Stone-Hill');
  await dialog.getByLabel('Club').fill('Another Trials Club');
  await dialog.getByLabel('Machine').fill('Montesa 4Ride');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await run.app.close();
  run = await launchApp(run);
  ({ window } = run);
  await window.getByRole('button', { name: 'Open Example Club Trial' }).click();
  await window.getByRole('navigation', { name: 'Event' }).getByRole('button', { name: /Riders/ }).click();
  const row = window.getByRole('row', { name: new RegExp(`^${number} `) });
  await expect(row).toContainText('Averie Stone-Hill');
  await expect(row).toContainText('Another Trials Club');
  await expect(row).toContainText('Montesa 4Ride');
}); // prettier-ignore

test('a file tScore does not recognise is refused in plain words', async () => {
  await newEventAtRiders();
  const path = join(run.userData, 'something.csv');
  writeFileSync(path, 'Name,Grade\r\nAvery Stone,Trial 1\r\n');
  await pick(path);
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  const alert = window.getByRole('alert').filter({ hasText: "The entry list wasn't read" });
  await expect(alert).toContainText("tScore doesn't recognise this file");
  await expect(alert).toContainText('TS-IMP-005');
});

test("Ridernet's questions export is named, and the log records what kind of file it was", async () => {
  await newEventAtRiders();
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['Event_Id', 'Event_Name', 'Participant_Name', 'RidernetID', 'DOB', 'Question', 'Answer'],
      ['1', 'Example Trial', 'Avery Stone', '900001', '01/01/1990', 'Machine', 'Example 250'],
    ]),
    'Sheet1',
  );
  const path = join(run.userData, 'eventRiderQuestions-1-2027-01-03.xls');
  writeFileSync(path, XLSX.write(book, { type: 'buffer', bookType: 'biff8' }) as Buffer);
  await pick(path);
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  const alert = window.getByRole('alert').filter({ hasText: "The entry list wasn't read" });
  await expect(alert).toContainText("Ridernet's entry questions export");
  await expect(alert).toContainText('TS-IMP-006');

  const logged = readFileSync(join(run.userData, 'logs', 'main.log'), 'utf8');
  expect(logged).toContain('entry list not read');
  expect(logged).toContain("type: '.xls'");
  expect(logged).toContain('IMPORT_OTHER_EXPORT');
  expect(logged).not.toMatch(/Avery|900001|1990|Example 250|1-2027-01-03/);
});

test('the import and riders screens meet WCAG 2.2 AA (automated check)', async () => {
  await newEventAtRiders();
  await importRidernet();
  const check = async () => {
    const results = await new AxeBuilder({ page: window })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
      ),
    ).toEqual([]);
  };
  await check();
  await window.getByLabel('Event class for Twinshock').selectOption('Trial 4');
  await window.getByRole('radio', { name: 'Only Trial 4', exact: true }).check();
  await window.getByRole('button', { name: 'Import 5 riders' }).click();
  await expect(window.getByRole('status')).toBeVisible();
  await check();
});

test('Riders saves the sample rider list with no internet, and it imports', async () => {
  await newEventAtRiders();
  const saveTo = join(run.userData, 'my-riders.csv');
  await run.app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (() =>
      Promise.resolve({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, saveTo);
  await window.getByRole('button', { name: 'Save a sample rider list…' }).click();
  await expect(window.getByText('Sample rider list saved')).toBeVisible();
  await expect(window.getByText(`Saved as ${saveTo}.`)).toBeVisible();

  // The website's own file, byte for byte (byte-order mark included): no second copy.
  const site = readFileSync(join(__dirname, '../../../site/tscore-rider-list-sample.csv'));
  expect(readFileSync(saveTo).equals(site)).toBe(true);

  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} element(s))`),
  ).toEqual([]);

  await pick(saveTo);
  await window.getByRole('button', { name: 'Import from entry list…' }).click();
  await expect(window.getByText('✓ Recognised: tScore rider list')).toBeVisible();
});
