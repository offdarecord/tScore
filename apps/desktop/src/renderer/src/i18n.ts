import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { messagesFor, pickLanguage } from '../../shared/i18n';

/**
 * The screens' language: the one the main process passed in the page's address (`?lang=`), from
 * the laptop's language setting, else the browser's. English when there's no translation.
 */
export const language = pickLanguage(
  new URLSearchParams(window.location.search).get('lang') ?? navigator.language,
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
export const isMac = /Mac/i.test(navigator.userAgent);

export default i18next;
