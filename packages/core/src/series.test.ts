import { describe, expect, it } from 'vitest';
import type { Results } from './generated/results.js';
import {
  computeSeries,
  DEFAULT_SERIES_POINTS,
  parsePointsScale,
  riderKey,
  seriesCsv,
  seriesHtml,
  type SeriesRules,
} from './series.js';

// Invented riders only. The point patterns are the ones seen in past published tallies.

type Entry = Results['classes'][number]['entries'][number];

const rules: SeriesRules = { points: DEFAULT_SERIES_POINTS, ties: 'share' };

function entry(
  name: string,
  number: number,
  position: number | null,
  extra: Partial<Entry> = {},
): Entry {
  return {
    number,
    riders: [{ name }],
    competition_status: 'competitive',
    status: 'finished',
    position,
    total: 0,
    ...extra,
  };
}

function round(classes: Record<string, Entry[]>): Results {
  return {
    schema: 'tscore.results/1',
    generator: { name: 'tScore', version: 'test' },
    generated_at: '2027-02-06T12:00:00+11:00',
    status: 'final',
    revision: 1,
    event: {
      id: 'e',
      code: 'R',
      name: 'Round',
      days: [{ day: 1, date: '2027-02-06' }],
      scoring: { score_values: [0, 1, 2, 3, 5], direction: 'low_wins', tie_breaks: ['total'] },
    },
    classes: Object.entries(classes).map(([name, entries]) => ({
      name,
      days: [{ day: 1, sections: 10, laps: 4 }],
      entries,
    })),
  };
}

const tally = (rounds: Results[], r: SeriesRules = rules) =>
  computeSeries(
    rounds.map((results, i) => ({ round: i + 1, results })),
    r,
  );

describe('series points', () => {
  it('gives points by place, blanks for rounds not ridden, and shares equal totals (1, 1, 3)', () => {
    const t = tally([
      round({ 'Trial 3': [entry('Avery Stone', 1, 1), entry('Blake River', 2, 2)] }),
      round({
        'Trial 3': [
          entry('Casey Hill', 3, 1),
          entry('Drew Field', 4, 2),
          entry('avery  STONE', 11, 3),
        ],
      }),
    ]);
    const rows = t.classes[0]!.rows;
    expect(rows.map((r) => [r.name, r.number, r.rounds, r.total, r.place, r.shared])).toEqual([
      ['avery  STONE', 11, [25, 20], 45, 1, false],
      ['Casey Hill', 3, [null, 25], 25, 2, false],
      ['Blake River', 2, [22, null], 22, 3, true],
      ['Drew Field', 4, [null, 22], 22, 3, true],
    ]);
    // Two equal at the top: 1, 1, 3.
    const top = tally([
      round({ T1: [entry('Avery Stone', 1, 1), entry('Blake River', 2, 2)] }),
      round({
        T1: [entry('Blake River', 2, 1), entry('Avery Stone', 1, 2), entry('Casey Hill', 3, 3)],
      }),
    ]);
    expect(top.classes[0]!.rows.map((r) => r.place)).toEqual([1, 1, 3]);
  });

  it('counts the best N rounds when the series says so', () => {
    // Rounds of 20, 22, 22, 20: total 84, best 3 = 64.
    const rider = (p: number) => round({ T2: [entry('Ellis Moor', 9, p)] });
    const scale = { ...rules, points: [25, 22, 20, 18, 16] };
    const pos = (pts: number) => scale.points.indexOf(pts) + 1;
    const t = tally([rider(pos(20)), rider(pos(22)), rider(pos(22)), rider(pos(20))], {
      ...scale,
      bestOf: 3,
    });
    expect(t.classes[0]!.rows[0]).toMatchObject({ total: 84, counted: 64 });
  });

  it('gives 0 to riders who rode but were not placed, and leaves NC riders out', () => {
    const t = tally([
      round({
        T4: [
          entry('Finley Ash', 1, 1),
          entry('Gray Oak', 2, null, { status: 'dnf' }),
          entry('Harper Elm', 3, null, { competition_status: 'no_award' }),
          entry('Indy Bay', 4, null, { competition_status: 'non_competitive', total: null }),
          entry('Jules Fen', 5, null, { status: 'dns', total: null }),
        ],
      }),
    ]);
    expect(t.classes[0]!.rows.map((r) => [r.name, r.rounds[0]])).toEqual([
      ['Finley Ash', 25],
      ['Gray Oak', 0],
      ['Harper Elm', 0],
    ]);
  });

  it('can split equal totals by most round wins, then the latest round', () => {
    const t = tally(
      [
        round({ T1: [entry('Kai Dale', 1, 1), entry('Lee Glen', 2, 3)] }),
        round({ T1: [entry('Lee Glen', 2, 1), entry('Kai Dale', 1, 3)] }),
        round({ T1: [entry('Max Holt', 3, 1), entry('Kai Dale', 1, 2), entry('Lee Glen', 2, 2)] }),
      ],
      { ...rules, ties: 'split' },
    );
    // Kai: 25+20+22 = 67, Lee: 20+25+22 = 67, one win each, same latest round: still shared.
    const rows = t.classes[0]!.rows;
    expect(rows.slice(0, 2).map((r) => [r.counted, r.place, r.shared])).toEqual([
      [67, 1, true],
      [67, 1, true],
    ]);
    const split = tally(
      [
        round({ T1: [entry('Kai Dale', 1, 1), entry('Lee Glen', 2, 2)] }),
        round({ T1: [entry('Lee Glen', 2, 1), entry('Kai Dale', 1, 2)] }),
      ],
      { ...rules, ties: 'split' },
    );
    // 47 each, one win each; Lee was better in the latest round.
    expect(split.classes[0]!.rows.map((r) => [r.name, r.place])).toEqual([
      ['Lee Glen', 1],
      ['Kai Dale', 2],
    ]);
  });

  it('keeps one tally per class, so a rider who changes class has a line in each', () => {
    const t = tally([
      round({ T3: [entry('Noa Reed', 7, 1)] }),
      round({ T2: [entry('Noa Reed', 7, 2)] }),
    ]);
    expect(t.classes.map((c) => [c.name, c.rows[0]!.rounds])).toEqual([
      ['T3', [25, null]],
      ['T2', [null, 22]],
    ]);
  });

  it('shows junior surnames as an initial when asked, still matching on the full name', () => {
    const junior = (n: number) =>
      entry('Ollie Brook', 5, n, {
        riders: [{ name: 'Ollie Brook', given_name: 'Ollie', family_name: 'Brook' }],
      });
    const rounds = [round({ Juniors: [junior(1)] }), round({ Juniors: [junior(2)] })].map(
      (results, i) => ({ round: i + 1, results }),
    );
    const t = computeSeries(rounds, rules, { juniorSurnameInitialClasses: ['Juniors'] });
    expect(t.classes[0]!.rows).toEqual([
      expect.objectContaining({ name: 'Ollie B.', rounds: [25, 22], total: 47 }),
    ]);
  });

  it('matches riders by name, ignoring case, spacing and accents', () => {
    expect(riderKey(entry('  Zoë   Ashby ', 1, 1))).toBe(riderKey(entry('zoe ashby', 2, 1)));
  });

  it('reads a points scale typed by the desk', () => {
    expect(parsePointsScale('25, 22, 20 18;16')).toEqual([25, 22, 20, 18, 16]);
    expect(parsePointsScale('20, 25')).toBeNull();
    expect(parsePointsScale('25, x')).toBeNull();
    expect(parsePointsScale('')).toBeNull();
  });

  it('saves the tally as CSV and a printable page, with a Best N column when used', () => {
    const t = tally(
      [
        round({ T1: [entry('Kai <b>Dale</b>', 1, 1), entry('Lee Glen', 2, 2)] }),
        round({ T1: [entry('Lee Glen', 2, 1)] }),
      ],
      { ...rules, bestOf: 1 },
    );
    const opts = {
      name: 'Winter Series',
      roundLabels: ['Rd 1', 'Rd 2'],
      rules: { ...rules, bestOf: 1 },
      footer: 'tScore',
      notCounted: 'Round 3 is not final yet, so it is not counted.',
    };
    const csv = seriesCsv(t, opts).replace(/^﻿/, '').split('\r\n');
    expect(csv.slice(0, 3)).toEqual([
      'Class,Place,Name,Number,Club,Rd 1,Rd 2,Total,Best 1',
      'T1,1=,Lee Glen,2,,22,25,47,25',
      'T1,1=,Kai <b>Dale</b>,1,,25,,25,25',
    ]);
    const html = seriesHtml(t, opts);
    expect(html).toContain('Kai &lt;b&gt;Dale&lt;/b&gt;');
    expect(html).toContain('<th class="n">Best 1</th>');
    expect(html).toContain('Round 3 is not final yet');
  });
});
