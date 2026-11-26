/**
 * The app's wording, by language (#64). English (`locales/en.json`) is the only language shipped
 * for now; every other language falls back to it. `en-XA` is a pseudo-language for testing:
 * English with every letter accented and each message lengthened, so anything still written
 * straight into a screen, or cut off when a translation runs longer, stands out.
 *
 * To add a language, copy `locales/en.json`, translate the values (never the keys or the
 * `{{placeholders}}`), and add it to LANGUAGES.
 */
import en from '../locales/en.json';

export type Messages = typeof en;

export const LANGUAGES: Readonly<Record<string, Messages>> = { en };

export const PSEUDO = 'en-XA';

/** The language to show for a requested one (e.g. the laptop's "en-AU"): English if no match. */
export function pickLanguage(requested: string | null | undefined): string {
  if (!requested) return 'en';
  if (requested === PSEUDO) return PSEUDO;
  const base = requested.toLowerCase().split('-')[0] ?? 'en';
  return base in LANGUAGES ? base : 'en';
}

/** Every letter has an accented look-alike, so no plain English survives in pseudo text. */
const ACCENTS: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ď', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ',
  l: 'ĺ', m: 'ṁ', n: 'ñ', o: 'ö', p: 'ṗ', q: 'ʠ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ü', v: 'ṽ',
  w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ď', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ',
  L: 'Ĺ', M: 'Ṁ', N: 'Ñ', O: 'Ö', P: 'Ṗ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ü', V: 'Ṽ',
  W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
}; // prettier-ignore

/**
 * One message in the pseudo-language: letters accented, about 35% longer, in [brackets].
 * `{{placeholders}}` and `<tags>` are left exactly as they are.
 */
export function pseudo(text: string): string {
  const parts = text.split(/(\{\{[^}]+\}\}|<[^>]+>)/);
  const keep = (p: string) => p.startsWith('{{') || p.startsWith('<');
  const body = parts
    .map((p) => (keep(p) ? p : p.replace(/[A-Za-z]/g, (ch) => ACCENTS[ch] ?? ch)))
    .join('');
  // Lengthen by the wording only, not the placeholders and tags.
  const letters = parts.filter((p) => !keep(p)).join('').length;
  return `[${body}${'·'.repeat(Math.ceil(letters * 0.35))}]`;
}

/** Every message in a set, made pseudo. */
export function pseudoMessages<T>(messages: T): T {
  if (typeof messages === 'string') return pseudo(messages) as T;
  if (messages && typeof messages === 'object') {
    return Object.fromEntries(
      Object.entries(messages).map(([k, v]) => [k, pseudoMessages(v)]),
    ) as T;
  }
  return messages;
}

/** The messages for a language picked by pickLanguage. */
export function messagesFor(language: string): Messages {
  if (language === PSEUDO) return pseudoMessages(en);
  return LANGUAGES[language] ?? en;
}

/**
 * Core's wording (results phrases, …) through an i18next `t`: the key in the message files, and
 * the English core passed as the fallback.
 */
export function coreTranslator(
  t: (key: string, options: Record<string, unknown>) => string,
): (
  key: string,
  english: string,
  values?: Readonly<Record<string, string | number | boolean>>,
) => string {
  return (key, english, values) => t(key, { ...values, defaultValue: english });
}
