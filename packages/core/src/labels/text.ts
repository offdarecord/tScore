/**
 * Fitting text onto a card label. Word lays the text out, so tScore estimates widths from
 * Arial's character widths (the same as Helvetica's) and picks wording and sizes that fit.
 */

/** Arial advance widths in 1/1000 em, for the characters names and classes use. */
const ARIAL: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191, '(': 333,
  ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278,
  '?': 556, '@': 1015, '_': 556, '·': 278, '’': 222, '‘': 222, '…': 1000, '–': 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667,
  L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667,
  W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500,
  l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500,
  w: 722, x: 500, y: 500, z: 500,
}; // prettier-ignore

const DIGIT = 556;
/** Wider than most letters, so unknown characters (accents, other scripts) don't overflow. */
const OTHER = 722;
/** Bold Arial is about this much wider than regular. */
const BOLD = 1.08;
const MM_PER_PT = 25.4 / 72;

/** Width of `text` in millimetres, in Arial at `pt` points. */
export function textWidthMm(text: string, pt: number, bold = false): number {
  let units = 0;
  for (const ch of text) {
    units += ch >= '0' && ch <= '9' ? DIGIT : (ARIAL[ch] ?? OTHER);
  }
  return (units / 1000) * pt * MM_PER_PT * (bold ? BOLD : 1);
}

export interface FittedText {
  readonly text: string;
  /** Font size in points. */
  readonly pt: number;
}

/** Cut `text` short with an ellipsis so it fits `widthMm` at `pt`. */
export function cutToFit(text: string, widthMm: number, pt: number, bold = false): string {
  if (textWidthMm(text, pt, bold) <= widthMm) return text;
  const chars = [...text];
  while (chars.length > 1 && textWidthMm(`${chars.join('').trimEnd()}…`, pt, bold) > widthMm) {
    chars.pop();
  }
  return `${chars.join('').trimEnd()}…`;
}

/** Name sizes: normal, then smaller for long names. */
export const NAME_PT = 6.5;
export const NAME_SMALL_PT = 5.5;

/**
 * A rider's name for a label, in the agreed order (canvas review, 24 Nov): the full name if it
 * fits; otherwise "F. SURNAME"; then a smaller font; then cut short. It never runs under the QR.
 */
export function fitName(givenName: string, familyName: string, widthMm: number): FittedText {
  const given = givenName.trim();
  const family = familyName.trim();
  const full = [given, family].filter(Boolean).join(' ');
  if (textWidthMm(full, NAME_PT) <= widthMm) return { text: full, pt: NAME_PT };
  const short = [given ? `${[...given][0]}.` : '', family.toUpperCase()].filter(Boolean).join(' ');
  if (textWidthMm(short, NAME_PT) <= widthMm) return { text: short, pt: NAME_PT };
  return { text: cutToFit(short, widthMm, NAME_SMALL_PT), pt: NAME_SMALL_PT };
}
