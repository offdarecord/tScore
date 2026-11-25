import { app } from 'electron';

/**
 * The language asked of the screens: the laptop's (Electron reads Windows' setting). Tests can
 * ask for another, e.g. the `en-XA` pseudo-language, in a development build only.
 */
export function uiLanguage(): string {
  const test = process.env['TSCORE_TEST_LOCALE'];
  if (test && !app.isPackaged) return test;
  return app.getLocale();
}
