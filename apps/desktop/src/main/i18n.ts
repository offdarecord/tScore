import i18next from 'i18next';
import { coreTranslator, messagesFor, pickLanguage } from '../shared/i18n';
import { uiLanguage } from './locale';

/**
 * The main process's wording (dialog titles, the results PDF, …) in the screens' language, from
 * the same message files. Made when first used, after the app is ready (the language needs it).
 */
let instance: typeof i18next | null = null;

function messages(): typeof i18next {
  if (instance) return instance;
  const language = pickLanguage(uiLanguage());
  instance = i18next.createInstance();
  void instance.init({
    lng: language,
    fallbackLng: 'en',
    resources: { [language]: { translation: messagesFor(language) } },
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}

/** A message, with values filled in. */
export function t(key: string, values?: Record<string, unknown>): string {
  return messages().t(key, values ?? {}) as string;
}

/** Core's wording in the screens' language. */
export const coreT = coreTranslator((key, options) => messages().t(key, options) as string);

/** The page language for printed output, e.g. "en" or "en-XA". */
export function pageLanguage(): string {
  return pickLanguage(uiLanguage());
}
