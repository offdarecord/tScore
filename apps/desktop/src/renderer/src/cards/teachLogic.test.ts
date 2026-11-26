import type { TeachCheck, TeachLayout } from '@tscore/vision';
import { describe, expect, it } from 'vitest';
import { cardTypeId, columnProblems, idClash, sizeProblems, tunedFrom } from './teachLogic';

const LAYOUT: TeachLayout = {
  id: 'example-club-12',
  name: 'Example club card',
  card: { width_mm: 60, height_mm: 150 },
  rows: 12,
  locator: 'manual-corners',
  grid: { origin_x_mm: 0, origin_y_mm: 15, unit_mm: 10, row_mm: 9 },
  columns: [
    { score: 0, x_mm: 10 },
    { score: 1, x_mm: 20 },
    { score: 2, x_mm: 30 },
    { score: 3, x_mm: 40 },
    { score: 5, x_mm: 50 },
  ],
  cell_mm: 1.5,
  marking_style: 'ink',
  correction_rules: 'none',
};

describe('teach a card: the plain rules', () => {
  it('makes an id from the name', () => {
    expect(cardTypeId('Example Club — 12 sections!')).toBe('example-club-12-sections');
    expect(cardTypeId('Café card')).toBe('cafe-card');
    expect(cardTypeId('***')).toBe('club-card');
    expect(cardTypeId('a'.repeat(60))).toHaveLength(40);
  });

  it('checks the name, size and rows', () => {
    expect(sizeProblems(LAYOUT)).toEqual([]);
    expect(
      sizeProblems({ ...LAYOUT, name: ' ', rows: 0, card: { width_mm: 0, height_mm: 9 } }),
    ).toEqual(['teach.problem.name', 'teach.problem.size', 'teach.problem.rows']);
  });

  it('checks the columns and the grid', () => {
    expect(columnProblems(LAYOUT)).toEqual([]);
    const two = { ...LAYOUT, columns: LAYOUT.columns.slice(0, 2) };
    expect(columnProblems(two)).toContain('teach.problem.columns');
    const same = {
      ...LAYOUT,
      columns: LAYOUT.columns.map((c, i) => (i === 1 ? { score: 0, x_mm: 10.5 } : c)),
    };
    expect(columnProblems(same)).toEqual(['teach.problem.sameScore', 'teach.problem.samePlace']);
    const off = { ...LAYOUT, columns: [...LAYOUT.columns, { score: 9, x_mm: 70 }] };
    expect(columnProblems(off)).toEqual(['teach.problem.offCard']);
    const tall = { ...LAYOUT, grid: { ...LAYOUT.grid, row_mm: 20 } };
    expect(columnProblems(tall)).toEqual(['teach.problem.grid']);
  });

  it('says when a name clashes with a card type this laptop knows', () => {
    const known = [
      { profile: { id: 'regional-16', name: 'Regional' }, builtIn: true },
      { profile: { id: 'example-club-12', name: 'Example' }, builtIn: false },
    ];
    expect(idClash('regional-16', known)).toBe('built-in');
    expect(idClash('example-club-12', known)).toBe('replaces');
    expect(idClash('another', known)).toBeNull();
  });

  it('records what the thresholds were tuned on', () => {
    const check: TeachCheck = {
      cards: 5,
      rows: 80,
      right: 76,
      toPerson: 3,
      wrong: 1,
      leastMargin: 0.3,
      readings: [],
    };
    expect(tunedFrom(check, true, '2026-11-26')).toEqual({
      source: 'synthetic',
      cards: 5,
      rows: 80,
      rows_read: 0.963,
      wrong_auto_accepts: 1,
      date: '2026-11-26',
    });
    expect(tunedFrom(check, false, '2026-11-26').source).toBe('real');
  });
});
