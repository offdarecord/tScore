import { existsSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

let run: Launched;
let window: Page;

test.beforeEach(async () => {
  run = await launchApp();
  ({ window } = run);
});

test.afterEach(async () => {
  await run?.app.close();
});

/** Fill in the new-event form's required fields. */
async function fillNewEvent(page: Page, name = 'Example Club Trial', date = '2027-02-06') {
  await page.getByRole('button', { name: 'New event' }).click();
  await expect(page.getByRole('heading', { name: 'New event', level: 1 })).toBeVisible();
  await page.getByLabel('Event name').fill(name);
  await page.getByLabel('Date', { exact: true }).fill(date);
}

const eventFile = (code: string, date = '2027-02-06') =>
  join(run.eventsDir, `${date} ${code}`, 'event.sqlite');

test('a new event is set up, saved in its own folder, and opened', async () => {
  await fillNewEvent(window);
  // The code is suggested from the name.
  await expect(window.getByLabel('Event code')).toHaveValue('ECT');
  await window.getByRole('button', { name: 'Create event' }).click();

  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  const nav = window.getByRole('navigation', { name: 'Event' });
  await expect(nav.getByText('Example Club Trial')).toBeVisible();
  await expect(nav.getByText('ECT · Sat 6 Feb 2027')).toBeVisible();
  await expect(window).toHaveTitle('Example Club Trial – tScore');
  expect(existsSync(eventFile('ECT'))).toBe(true);
});

test('says what to fix, in plain words, and saves nothing until it is fixed', async () => {
  await window.getByRole('button', { name: 'New event' }).click();
  await window.getByLabel('Date', { exact: true }).fill('');
  await window.getByLabel('Sections per lap for Trial 1').fill('17');
  // Card limits show as soon as they're typed.
  await expect(window.getByText('the regional card has only 16 rows')).toBeVisible();

  await window.getByRole('button', { name: 'Create event' }).click();
  const summary = window.getByRole('alert').filter({ hasText: 'Fix these before saving' });
  await expect(summary).toContainText('Give the event a name.');
  await expect(summary).toContainText('The event code needs 2 to 16 capital letters');
  await expect(summary).toContainText('Choose the date.');
  await expect(summary).toContainText('Trial 1 has 17 sections');
  expect(existsSync(run.eventsDir)).toBe(false);

  await window.getByLabel('Event name').fill('Winter Round 2');
  await window.getByLabel('Date', { exact: true }).fill('2027-06-13');
  await window.getByLabel('Sections per lap for Trial 1').fill('12');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  expect(existsSync(eventFile('WR2', '2027-06-13'))).toBe(true);
});

test('changes to the setup are kept, and the event is in the recent list after a restart', async () => {
  await fillNewEvent(window);
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();

  const save = window.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeDisabled();
  await window.getByLabel('Laps for Juniors').fill('3');
  await window.getByLabel('Club').fill('Example Motorcycle Club');
  await window.getByRole('button', { name: 'Add class' }).click();
  await window.getByLabel('Name of class 10').fill('Masters');
  await save.click();
  await expect(window.getByRole('status')).toHaveText('Saved');

  await run.app.close();
  run = await launchApp(run);
  ({ window } = run);

  await expect(window.getByRole('heading', { name: 'Recent events' })).toBeVisible();
  await window.getByRole('button', { name: 'Open Example Club Trial' }).click();
  await expect(window.getByLabel('Laps for Juniors')).toHaveValue('3');
  await expect(window.getByLabel('Club')).toHaveValue('Example Motorcycle Club');
  await expect(window.getByLabel('Name of Masters')).toBeVisible();
});

test('a two-day event asks for each day, with the second day following the first', async () => {
  await fillNewEvent(window, 'State Championship');
  await window.getByLabel('Days').selectOption('2');
  await expect(window.getByLabel('Day 2 date')).toHaveValue('2027-02-07');
  await window.getByLabel('Laps for Juniors on day 2').fill('2');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  await expect(window.getByLabel('Laps for Juniors on day 2')).toHaveValue('2');
  await expect(window.getByLabel('Laps for Juniors on day 1')).toHaveValue('4');
});

test('"All events" closes the event and goes back to the start screen', async () => {
  await fillNewEvent(window);
  await window.getByRole('button', { name: 'Create event' }).click();
  await window.getByRole('button', { name: '← All events' }).click();
  await expect(window.getByRole('heading', { name: 'Recent events' })).toBeVisible();
  await expect(window).toHaveTitle('tScore');
});

test('"Open event file…" opens an event chosen in the file dialog', async () => {
  await fillNewEvent(window);
  await window.getByRole('button', { name: 'Create event' }).click();
  await window.getByRole('button', { name: '← All events' }).click();

  // Stand in for the Windows file dialog: the desk picks the event's file.
  const file = eventFile('ECT');
  await run.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
  }, file);
  await window.getByRole('button', { name: 'Open event file…' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
});

test('a file that is not an event is refused with a plain message', async () => {
  await run.app.evaluate(
    ({ dialog }, picked) => {
      dialog.showOpenDialog = (() =>
        Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
    },
    join(run.userData, 'not-an-event', 'event.sqlite'),
  );
  await window.getByRole('button', { name: 'Open event file…' }).click();
  const alert = window.getByRole('alert').filter({ hasText: "The event didn't open" });
  await expect(alert).toContainText('No tScore event in this folder');
  await expect(alert).toContainText('TS-DB-001');
});

test('the event setup screen meets WCAG 2.2 AA (automated accessibility check)', async () => {
  await fillNewEvent(window);
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} element(s))`),
  ).toEqual([]);
});
