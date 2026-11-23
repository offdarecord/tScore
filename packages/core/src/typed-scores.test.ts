import { describe, expect, it } from 'vitest';
import { describeTypedScoreProblem, readTypedScores, singleDigitScores } from './typed-scores.js';

const USUAL = [0, 1, 2, 3, 5];

function problemOf(r: ReturnType<typeof readTypedScores>) {
  if (!r.problem) throw new Error('expected a problem');
  return r.problem;
}

describe('reading typed scores', () => {
  it('reads one digit per section, ignoring spaces and commas', () => {
    const r = readTypedScores('01 02,5 3001', 10, USUAL);
    expect(r.scores).toEqual([0, 1, 0, 2, 5, 3, 0, 0, 1]);
    expect(r.tokens).toHaveLength(9);
    expect(r.problem).toEqual({ kind: 'too_few', missing: 1 });
    expect(r.complete).toBe(false);
    expect(r.total).toBe(12);
  });

  it('is complete with exactly one allowed score per section', () => {
    const r = readTypedScores('0102530010', 10, USUAL);
    expect(r.complete).toBe(true);
    expect(r.problem).toBeNull();
    expect(r.total).toBe(12);
  });

  it('names the first section that has something other than a score', () => {
    const r = readTypedScores('0104', 10, USUAL);
    expect(r.scores).toEqual([0, 1, 0, null]);
    expect(r.problem).toEqual({ kind: 'not_a_score', section: 4, text: '4' });
    expect(describeTypedScoreProblem(problemOf(r), USUAL)).toBe(
      "4 isn't a score (section 4). Use 0, 1, 2, 3 or 5.",
    );
  });

  it('says when too many scores are typed for the class', () => {
    const r = readTypedScores('00000', 4, USUAL);
    expect(r.problem).toEqual({ kind: 'too_many', sections: 4 });
    expect(describeTypedScoreProblem(problemOf(r), USUAL, 'Juniors')).toBe(
      'Too many scores: Juniors rides 4 sections.',
    );
  });

  it('counts what is still to type', () => {
    expect(describeTypedScoreProblem({ kind: 'too_few', missing: 1 }, USUAL)).toBe(
      '1 section still to type.',
    );
    expect(readTypedScores('', 6, USUAL).problem).toEqual({ kind: 'too_few', missing: 6 });
  });

  it('needs separators when a score has more than one digit (gate trials)', () => {
    const gate = [0, 5, 10, 20];
    expect(singleDigitScores(USUAL)).toBe(true);
    expect(singleDigitScores(gate)).toBe(false);
    const r = readTypedScores('10 0, 20 5', 4, gate);
    expect(r.scores).toEqual([10, 0, 20, 5]);
    expect(r.complete).toBe(true);
    expect(r.total).toBe(35);
  });

  it('refuses letters and other characters as scores', () => {
    const r = readTypedScores('0a1', 3, USUAL);
    expect(r.scores).toEqual([0, null, 1]);
    expect(r.problem).toEqual({ kind: 'not_a_score', section: 2, text: 'a' });
  });
});
