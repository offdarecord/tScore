import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { coreTranslator, messagesFor, pickLanguage } from '../../shared/i18n';

const inBrowser = typeof window !== 'undefined';

/**
 * The screens' language: the one the main process passed in the page's address (`?lang=`), from
 * the laptop's language setting, else the browser's. English when there's no translation, and
 * in unit tests (no window).
 */
export const language = pickLanguage(
  inBrowser
    ? (new URLSearchParams(window.location.search).get('lang') ?? navigator.language)
    : 'en',
);

void i18next.use(initReactI18next).init({
  lng: language,
  fallbackLng: 'en',
  resources: { [language]: { translation: messagesFor(language) } },
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

/** Mac or Windows, for the few words that differ ("Match Windows" or "Match System"). */
export const isMac = inBrowser && /Mac/i.test(navigator.userAgent);

/** Core's wording (results phrases, …) in the screens' language. */
export const coreT = coreTranslator((key, options) =>
  String(i18next.t(key as never, options as never)),
);

export default i18next;
