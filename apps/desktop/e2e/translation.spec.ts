import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import en from '../src/locales/en.json';
import { pseudo } from '../src/shared/i18n';
import { launchApp, type Launched } from './app';

// The screens' wording comes from the message file (#64): in the en-XA pseudo-language every
// converted message shows accented and lengthened, so English left in a screen stands out.

let run: Launched;

test.afterEach(async () => {
  await run?.app.close();
});

/** Plain English words visible on the page (three or more unaccented letters), less `allowed`. */
async function plainWords(window: Page, allowed: Iterable<string>): Promise<string[]> {
  const words = await window.evaluate(() => {
    const out: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!el || !el.checkVisibility()) continue;
      // Not part of an accented word, and not inside the help panel's guide (not translated).
      if (el.closest('.help-page')) continue;
      const plain = /(?<!\p{L})[A-Za-z]{3,}(?!\p{L})/gu;
      for (const w of n.textContent?.match(plain) ?? []) out.push(w);
    }
    return out;
  });
  const ok = new Set(allowed);
  return [...new Set(words.filter((w) => !ok.has(w)))];
}

const words = (...texts: string[]) => texts.flatMap((t) => t.match(/[A-Za-z]{3,}/g) ?? []);

test('the home screen and the top bar show no English in the pseudo-language', async () => {
  run = await launchApp(undefined, { TSCORE_TEST_LOCALE: 'en-XA' });
  const { window } = run;
  await expect(window.getByRole('button', { name: pseudo(en.home.newEvent) })).toBeVisible();
  for (const english of [
    en.home.newEvent,
    en.home.openFile,
    en.home.restore,
    en.home.series,
    en.home.manage,
    en.app.about,
    en.scheme.light,
    en.scheme.dark,
  ]) {
    await expect(window.getByText(english, { exact: true })).toHaveCount(0);
  }
  // Everything is accented, except parts of the events folder's path (data, not wording).
  expect(await plainWords(window, words(run.eventsDir))).toEqual([]);
});

test('Event setup and Riders show no English in the pseudo-language', async () => {
  run = await launchApp(undefined, { TSCORE_TEST_LOCALE: 'en-XA' });
  const { window } = run;
  // Data, not wording: the default class names, the event's typed details, the file and riders.
  const data = words(
    run.eventsDir,
    run.userData,
    'Trial Plus Juniors Sidecar Minder Ñöñé riders csv',
    'tScore rider list',
    'Évént Çlüb',
    // Dates keep their fixed Australian form until they follow the region setting (#65).
    'Mon Tue Wed Thu Fri Sat Sun Jan Feb Mar Apr May Jun Jul Aug Sep Sept Oct Nov Dec',
  );

  await window.getByRole('button', { name: pseudo(en.home.newEvent) }).click();
  await window.getByLabel(pseudo(en.setup.name)).fill('Évént Ñö');
  await window.getByLabel(pseudo(en.setup.date)).fill('2027-02-06');
  expect(await plainWords(window, data)).toEqual([]);
  await window.getByRole('button', { name: pseudo(en.setup.create) }).click();
  await expect(window.getByRole('heading', { name: pseudo(en.setup.title) })).toBeVisible();
  expect(await plainWords(window, data)).toEqual([]);

  const nav = window.getByRole('navigation', { name: pseudo(en.nav.label) });
  await nav.getByRole('button', { name: new RegExp(escape(pseudo(en.nav.riders))) }).click();
  await expect(window.getByRole('heading', { name: pseudo(en.riders.title) })).toBeVisible();
  expect(await plainWords(window, data)).toEqual([]);

  const csv = join(run.userData, 'riders.csv');
  writeFileSync(
    csv,
    'Number,Given name,Family name,Class,Club,Competition status\r\n' +
      '1,Ává,Ñöñé,Trial 3,Évént Çlüb,\r\n2,Íris,Ñöñé,Ñöñé,Évént Çlüb,NC\r\n',
  );
  await run.app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (() =>
      Promise.resolve({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
  }, csv);
  await window.getByRole('button', { name: pseudo(en.riders.import) }).click();
  await expect(window.getByRole('heading', { name: pseudo(en.import.title) })).toBeVisible();
  expect(await plainWords(window, data)).toEqual([]);
  await window
    .getByLabel(pseudo(en.import.classFor).replace('{{raw}}', 'Ñöñé'))
    .selectOption('Trial 3');
  await window
    .getByRole('button', { name: pseudo(en.import.importN_other).replace('{{count}}', '2') })
    .click();
  await expect(window.getByRole('heading', { name: pseudo(en.riders.title) })).toBeVisible();
  expect(await plainWords(window, data)).toEqual([]);

  await window.getByRole('button', { name: pseudo(en.riders.late) }).click();
  await expect(window.getByRole('dialog')).toBeVisible();
  expect(await plainWords(window, data)).toEqual([]);
  await window.keyboard.press('Escape');
  await window
    .getByRole('button', { name: pseudo(en.riders.changeRider).replace('{{number}}', '1') })
    .click();
  await expect(window.getByRole('dialog')).toBeVisible();
  expect(await plainWords(window, data)).toEqual([]);
});

/** A string as a literal in a regular expression. */
function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
