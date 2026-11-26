/**
 * Wording made in the core package (results phrases, labels, …), in any language (#64). Core has
 * no translation library: each function that makes wording takes a `Translate`, and calls it with
 * a message key, the English, and the values to fill in. The app passes one that looks the key up
 * in its message files (falling back to the English); tests and data files use `english`.
 *
 * A `count` value lets the app pick the plural form for the language (`key_one`, `key_other`, …);
 * the English passed in is already the right form for English. `ordinal: true` with a count picks
 * the ordinal form (1st, 2nd, …).
 */
export type WordValues = Readonly<Record<string, string | number | boolean>>;

export type Translate = (key: string, english: string, values?: WordValues) => string;

/** Fill `{{name}}` places in a message. */
export function fill(text: string, values?: WordValues): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(values?.[k] ?? ''));
}

/** English, as the core package has always written it. */
export const english: Translate = (_key, text, values) => fill(text, values);
