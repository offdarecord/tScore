/**
 * Section score values under the default ruleset:
 * 0 = clean, 1–3 = dabs (feet down), 5 = fail.
 *
 * Other rulesets may define different values; this is the default only.
 */
export const SCORE_VALUES = [0, 1, 2, 3, 5] as const;

export type ScoreValue = (typeof SCORE_VALUES)[number];

export function isScoreValue(value: unknown): value is ScoreValue {
  return typeof value === 'number' && (SCORE_VALUES as readonly number[]).includes(value);
}
