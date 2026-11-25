import { expect, test } from '@playwright/test';
import en from '../src/locales/en.json';
import { pseudo } from '../src/shared/i18n';
import { launchApp, type Launched } from './app';

// The screens' wording comes from the message file (#64): in the en-XA pseudo-language every
// converted message shows accented and lengthened, so English left in a screen stands out.

let run: Launched;

test.afterEach(async () => {
  await run?.app.close();
});

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

  // Every visible word is accented, except parts of the events folder's path (data, not wording).
  const words = await window.evaluate(() => {
    const out: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!el || !el.checkVisibility()) continue;
      // A plain English word: three or more unaccented letters, not part of an accented word.
      const plain = /(?<!\p{L})[A-Za-z]{3,}(?!\p{L})/gu;
      for (const w of n.textContent?.match(plain) ?? []) out.push(w);
    }
    return out;
  });
  const pathWords = new Set(run.eventsDir.match(/[A-Za-z]{3,}/g) ?? []);
  expect(words.filter((w) => !pathWords.has(w))).toEqual([]);

  // It still works in the pseudo-language: New event opens the setup form.
  await window.getByRole('button', { name: pseudo(en.home.newEvent) }).click();
  await expect(window.getByRole('button', { name: pseudo(en.home.newEvent) })).toHaveCount(0);
});
