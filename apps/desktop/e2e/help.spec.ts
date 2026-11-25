import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type Launched } from './app';

// The user guide, shown in the app with the network off.

let run: Launched;
let window: Page;

test.beforeEach(async () => {
  run = await launchApp();
  ({ window } = run);
  // Help must work at a venue with no internet.
  await run.app.evaluate(({ session }) =>
    session.defaultSession.enableNetworkEmulation({ offline: true }),
  );
});

test.afterEach(async () => {
  await run?.app.close();
});

const nav = () => window.getByRole('navigation', { name: 'Event' });
const panel = () => window.getByRole('region', { name: 'Help', exact: true });
const helpButton = () => window.getByRole('button', { name: /^Help/ });

/** Open help for the screen in front, and expect it to show this heading. */
async function expectHelp(heading: string) {
  await helpButton().click();
  await expect(panel().getByRole('heading', { name: heading, exact: true })).toBeInViewport();
  await panel().getByRole('button', { name: 'Close' }).click();
  await expect(panel()).toBeHidden();
}

async function newEvent() {
  await window.getByRole('button', { name: 'New event' }).click();
  await expectHelp('Event setup');
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel(/^Date\b/).fill('2027-02-06');
  await window.getByRole('button', { name: 'Create event' }).click();
  await expect(window.getByRole('heading', { name: 'Event setup', level: 1 })).toBeVisible();
}

test('every screen opens the guide at its own page, offline', async () => {
  await expectHelp('Getting started');
  await newEvent();

  const screens: [string, string][] = [
    ['Pre-event check', 'Pre-event check'],
    ['Event setup', 'Event setup'],
    ['Riders', 'Riders'],
    ['Card labels', 'Card labels'],
    ['Manual entry', 'Manual entry'],
    ['Progress', 'Progress'],
    ['Still on course', 'Still on course'],
    ['Results', 'Results'],
  ];
  for (const [screen, heading] of screens) {
    await nav().getByRole('button', { name: screen }).click();
    await expectHelp(heading);
  }
});

test('F1 opens help; links, Back and Contents move around the guide', async () => {
  await expect(helpButton()).toBeVisible(); // the window is ready for keys
  await window.keyboard.press('F1');
  await expect(panel().getByRole('heading', { name: 'Getting started', level: 1 })).toBeVisible();

  await panel().getByRole('button', { name: 'Backups and restore' }).first().click();
  await expect(
    panel().getByRole('heading', { name: 'Backups and restore', level: 1 }),
  ).toBeVisible();
  await panel().getByRole('button', { name: '← Back' }).click();
  await expect(panel().getByRole('heading', { name: 'Getting started', level: 1 })).toBeVisible();

  await panel().getByRole('button', { name: 'Contents' }).click();
  await expect(panel().getByRole('heading', { name: 'tScore user guide' })).toBeVisible();

  // Esc inside the panel closes it.
  await panel().getByRole('button', { name: 'Contents' }).focus();
  await window.keyboard.press('Escape');
  await expect(panel()).toBeHidden();
});

test("Esc closes help after clicking the Help button, but stays the form's own in a box", async () => {
  // Clicking Help leaves focus on the button (it shows the blue focus ring): Esc closes help.
  await helpButton().click();
  await expect(helpButton()).toBeFocused();
  await expect(panel()).toBeVisible();
  await window.keyboard.press('Escape');
  await expect(panel()).toBeHidden();

  // In a box on the screen, Esc is the screen's own (here: Cancel on New event), not help's.
  await window.getByRole('button', { name: 'New event' }).click();
  await helpButton().click();
  await window.getByLabel('Event name').fill('Example Club Trial');
  await window.getByLabel('Event name').press('Escape');
  await expect(panel()).toBeVisible();
});

test('an error message links to what to do about its code', async () => {
  await run.app.evaluate(
    ({ dialog }, picked) => {
      dialog.showOpenDialog = (() =>
        Promise.resolve({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog;
    },
    join(run.userData, 'not-an-event', 'event.sqlite'),
  );
  await window.getByRole('button', { name: 'Open event file…' }).click();
  const alert = window.getByRole('alert').filter({ hasText: "The event didn't open" });
  await expect(alert).toContainText('TS-DB-001');
  await alert.getByRole('button', { name: 'What to do' }).click();
  await expect(panel().getByRole('heading', { name: 'TS-DB-001' })).toBeInViewport();
  await expect(panel()).toContainText('No tScore event in this folder');
});

test('the event-day checklist prints on one A4 page', async () => {
  await helpButton().click();
  await panel().getByRole('button', { name: 'Checklist' }).click();
  await expect(panel().getByRole('heading', { name: 'Event-day checklist' })).toBeVisible();

  // What Print does, without the printer dialog: print only the help page, to a PDF.
  await window.evaluate("document.body.dataset.print = 'help'");
  const pdf = await run.app.evaluate(async ({ BrowserWindow }) => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) throw new Error('no window');
    const data = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: false });
    return data.toString('latin1');
  });
  // Kept with the test's results, to look at if the page count changes.
  const saved = test.info().outputPath('checklist.pdf');
  writeFileSync(saved, Buffer.from(pdf, 'latin1'));
  await test.info().attach('checklist.pdf', { path: saved, contentType: 'application/pdf' });
  const pages = pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? [];
  expect(pages).toHaveLength(1);
  expect(pdf.length).toBeGreaterThan(1000);
});

test('the help panel meets WCAG 2.2 AA (automated accessibility check)', async () => {
  await helpButton().click();
  await panel().getByRole('button', { name: 'Checklist' }).click();
  const results = await new AxeBuilder({ page: window })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html).join(' ')})`),
  ).toEqual([]);
});
