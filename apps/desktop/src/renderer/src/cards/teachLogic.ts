/**
 * The Teach a card wizard's plain rules (#107), kept apart from the screens so they can be
 * tested: the new card type's id, and what's wrong with a description before it's used.
 */
import type { CardProfile } from '@tscore/core';
import type { TeachCheck, TeachLayout } from '@tscore/vision';

/** A card type id from its name: lower case, hyphens, at most 40 characters. */
export function cardTypeId(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'club-card';
}

/** A problem with the description, as a message key in the `teach` section. */
export type LayoutProblem =
  | 'teach.problem.name'
  | 'teach.problem.size'
  | 'teach.problem.rows'
  | 'teach.problem.columns'
  | 'teach.problem.sameScore'
  | 'teach.problem.samePlace'
  | 'teach.problem.offCard'
  | 'teach.problem.grid';

const ok = (x: number, min: number, max: number) => Number.isFinite(x) && x > min && x <= max;

/** The card's name, size and rows. */
export function sizeProblems(d: Pick<TeachLayout, 'name' | 'card' | 'rows'>): LayoutProblem[] {
  const out: LayoutProblem[] = [];
  if (!d.name.trim() || d.name.trim().length > 120) out.push('teach.problem.name');
  if (!ok(d.card.width_mm, 0, 300) || !ok(d.card.height_mm, 0, 400)) out.push('teach.problem.size');
  if (!Number.isInteger(d.rows) || d.rows < 1 || d.rows > 60) out.push('teach.problem.rows');
  return out;
}

/** The grid and the value columns. */
export function columnProblems(d: TeachLayout): LayoutProblem[] {
  const out: LayoutProblem[] = [];
  const { grid, columns, card } = d;
  const rowsTop = grid.origin_y_mm + grid.row_mm * d.rows;
  if (
    !ok(grid.row_mm, 0, card.height_mm) ||
    !ok(d.cell_mm, 0, 20) ||
    grid.origin_y_mm < 0 ||
    rowsTop > card.height_mm + 0.5
  ) {
    out.push('teach.problem.grid');
  }
  if (columns.length < 3 || columns.length > 10) out.push('teach.problem.columns');
  const scores = columns.map((c) => c.score);
  if (
    scores.some((s) => !Number.isInteger(s) || s < 0 || s > 99) ||
    new Set(scores).size !== scores.length
  ) {
    out.push('teach.problem.sameScore');
  }
  const places = [...columns.map((c) => c.x_mm)].sort((a, b) => a - b);
  if (places.some((x, i) => i > 0 && x - (places[i - 1] ?? 0) < d.cell_mm)) {
    out.push('teach.problem.samePlace');
  }
  if (columns.some((c) => !(c.x_mm > 0 && c.x_mm < card.width_mm))) {
    out.push('teach.problem.offCard');
  }
  return out;
}

/** What the card types this laptop knows say about a new id. */
export function idClash(
  id: string,
  known: readonly {
    readonly profile: Pick<CardProfile, 'id' | 'name'>;
    readonly builtIn: boolean;
  }[],
): 'built-in' | 'replaces' | null {
  const k = known.find((c) => c.profile.id === id);
  if (!k) return null;
  return k.builtIn ? 'built-in' : 'replaces';
}

/** The record of what the thresholds were tuned on, kept in the profile. */
export function tunedFrom(
  check: TeachCheck,
  drawn: boolean,
  today: string,
): CardProfile['thresholds']['tuned_from'] {
  const rowsRead = check.rows ? (check.right + check.wrong) / check.rows : 0;
  return {
    source: drawn ? 'synthetic' : 'real',
    cards: check.cards,
    rows: check.rows,
    rows_read: Math.round(rowsRead * 1000) / 1000,
    wrong_auto_accepts: check.wrong,
    date: today,
  };
}
