/**
 * Reading a card's scores as the desk types them on the Manual entry screen.
 *
 * With the usual scores (0, 1, 2, 3, 5) every score is one digit, so the desk types one digit per
 * section: "0102530010". Spaces and commas are ignored. If the event uses a score with more than
 * one digit (e.g. 10 in a gate trial), scores must be separated by spaces or commas.
 */

import { english, type Translate } from './words.js';

export type TypedScoreProblem =
  | { readonly kind: 'not_a_score'; readonly section: number; readonly text: string }
  | { readonly kind: 'too_few'; readonly missing: number }
  | { readonly kind: 'too_many'; readonly sections: number };

export interface TypedScores {
  /** One entry per typed score, from section 1. `null` where the text isn't an allowed score. */
  readonly scores: readonly (number | null)[];
  /** The raw text of each typed score, for showing it back. */
  readonly tokens: readonly string[];
  /** Every score allowed and exactly one per section. */
  readonly complete: boolean;
  /** The first problem, if any, for the desk to fix. */
  readonly problem: TypedScoreProblem | null;
  /** Lap total of the allowed scores typed so far. */
  readonly total: number;
}

/** Do this event's scores each fit in one digit, so they can be typed without separators? */
export function singleDigitScores(scoreValues: readonly number[]): boolean {
  return scoreValues.every((v) => Number.isInteger(v) && v >= 0 && v <= 9);
}

export function readTypedScores(
  text: string,
  sections: number,
  scoreValues: readonly number[],
): TypedScores {
  const tokens = singleDigitScores(scoreValues)
    ? [...text.replace(/[\s,]+/g, '')]
    : text.split(/[\s,]+/).filter((t) => t !== '');

  const scores = tokens.map((t) => {
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return scoreValues.includes(n) ? n : null;
  });

  let problem: TypedScoreProblem | null = null;
  const bad = scores.findIndex((s) => s === null);
  if (bad >= 0 && bad < sections) {
    problem = { kind: 'not_a_score', section: bad + 1, text: tokens[bad] ?? '' };
  } else if (tokens.length > sections) {
    problem = { kind: 'too_many', sections };
  } else if (tokens.length < sections) {
    problem = { kind: 'too_few', missing: sections - tokens.length };
  }

  const total = scores.reduce<number>((sum, s) => sum + (s ?? 0), 0);
  return { scores, tokens, complete: problem === null, problem, total };
}

/** The problem in plain words, for the desk. */
export function describeTypedScoreProblem(
  p: TypedScoreProblem,
  scoreValues: readonly number[],
  className?: string,
  t: Translate = english,
): string {
  const allowed = listWords(scoreValues.map(String), t);
  switch (p.kind) {
    case 'not_a_score':
      return t('core.notAScore', "{{text}} isn't a score (section {{section}}). Use {{allowed}}.", {
        text: p.text,
        section: p.section,
        allowed,
      });
    case 'too_few':
      return t(
        'core.stillToType',
        p.missing === 1 ? '1 section still to type.' : '{{count}} sections still to type.',
        { count: p.missing },
      );
    case 'too_many':
      return className === undefined
        ? t('core.tooManyScores', 'Too many scores: this class rides {{sections}} sections.', {
            sections: p.sections,
          })
        : t('core.tooManyScoresClass', 'Too many scores: {{name}} rides {{sections}} sections.', {
            name: className,
            sections: p.sections,
          });
  }
}

function listWords(items: readonly string[], t: Translate): string {
  if (items.length <= 1) return items.join('');
  return t('core.orList', '{{items}} or {{last}}', {
    items: items.slice(0, -1).join(', '),
    last: items[items.length - 1] ?? '',
  });
}
