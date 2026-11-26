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
    const csv = seriesCsv(t, opts)
      .replace(/^\uFEFF/, '')
      .split('\r\n');
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

describe('series matching by licence number (#125)', () => {
  type Licences = Record<number, (string | null)[]>;
  const withLicences = (rounds: [Results, Licences?][], r: SeriesRules = rules) =>
    computeSeries(
      rounds.map(([results, lic], i) => ({
        round: i + 1,
        results,
        ...(lic && { licences: new Map(Object.entries(lic).map(([n, l]) => [Number(n), l])) }),
      })),
      r,
    );
  const lines = (t: ReturnType<typeof computeSeries>) =>
    t.classes.flatMap((c) => c.rows.map((r) => [c.name, r.name, r.rounds, r.total]));

  it('matches one licence under two names as one rider, shown by the latest name, and notes it', () => {
    const t = withLicences([
      [round({ Clubman: [entry('Sam Stone', 4, 1)] }), { 4: ['VT-10442'] }],
      [round({ Clubman: [entry('Samuel Stone', 17, 2)] }), { 17: [' vt-10442 '] }],
    ]);
    expect(lines(t)).toEqual([['Clubman', 'Samuel Stone', [25, 22], 47]]);
    expect(t.classes[0]!.rows[0]!.number).toBe(17);
    expect(t.checks).toEqual([
      {
        kind: 'licence_names',
        class: 'Clubman',
        names: ['Sam Stone', 'Samuel Stone'],
        key: 'sam stone',
        combined: false,
      },
    ]);
  });

  it('keeps one name under two licences apart, and notes it rather than guessing', () => {
    const t = withLicences([
      [round({ Clubman: [entry('Jo Park', 1, 1)] }), { 1: ['111'] }],
      [round({ Clubman: [entry('Jo Park', 2, 1)] }), { 2: ['222'] }],
      // Without a licence, which Jo Park? Not guessed: a line by name.
      [round({ Clubman: [entry('Jo Park', 3, 1)] }), {}],
    ]);
    expect(lines(t)).toEqual([
      ['Clubman', 'Jo Park', [25, null, null], 25],
      ['Clubman', 'Jo Park', [null, 25, null], 25],
      ['Clubman', 'Jo Park', [null, null, 25], 25],
    ]);
    expect(t.checks).toEqual([
      {
        kind: 'name_licences',
        class: 'Clubman',
        names: ['Jo Park'],
        key: 'jo park',
        combined: false,
      },
    ]);
  });

  it('treats one name under two licences as one rider when the keeper chooses, by name only', () => {
    const rounds = [
      [
        round({ Clubman: [entry('Jo Park', 1, 1)], T2: [entry('Jo Park', 7, 1)] }),
        { 1: ['111'], 7: ['711'] },
      ],
      [
        round({ Clubman: [entry('Jo  PARK', 2, 2)], T2: [entry('Jo Park', 8, 2)] }),
        { 2: ['222'], 8: ['822'] },
      ],
      [round({ Clubman: [entry('Jo Park', 3, 1)] }), {}],
    ] as [Results, Licences][];
    const choice = [{ class: 'Clubman', key: 'jo park' }];
    const t = computeSeries(
      rounds.map(([results, lic], i) => ({
        round: i + 1,
        results,
        licences: new Map(Object.entries(lic).map(([n, l]) => [Number(n), l])),
      })),
      rules,
      {},
      choice,
    );
    // Clubman only: one line, and the round without a licence joins it. T2 stays apart.
    expect(lines(t)).toEqual([
      ['Clubman', 'Jo Park', [25, 22, 25], 72],
      ['T2', 'Jo Park', [25, null, null], 25],
      ['T2', 'Jo Park', [null, 22, null], 22],
    ]);
    expect(t.checks.map((c) => [c.class, c.kind, c.combined])).toEqual([
      ['Clubman', 'name_licences', true],
      ['T2', 'name_licences', false],
    ]);
  });

  it('matches riders without a licence by name, exactly as before', () => {
    const plain = [
      round({ T3: [entry('Avery Stone', 1, 1), entry('Blake River', 2, 2)] }),
      round({ T3: [entry('avery  stone', 9, 2), entry('Blake River', 2, 1)] }),
    ];
    const before = tally(plain);
    // Files older than licence numbers (no map), and entries with blank or "N/A" ones.
    const t = withLicences([[plain[0]!], [plain[1]!, { 9: [null], 2: ['N/A'] }]]);
    expect(t.classes).toEqual(before.classes);
    expect(t.checks).toEqual([]);
  });

  it('joins a round without a licence to the one licensed rider of that name', () => {
    const t = withLicences([
      [round({ T2: [entry('Rory Vale', 5, 2)] }), { 5: ['5501'] }],
      [round({ T2: [entry('Rory Vale', 5, 1)] })],
      [round({ T2: [entry('Rory J Vale', 8, 1)] }), { 8: ['5501'] }],
    ]);
    expect(lines(t)).toEqual([['T2', 'Rory J Vale', [22, 25, 25], 72]]);
  });

  it('matches a sidecar pair by licence only when both riders have one', () => {
    const pair = (driver: string, passenger: string, n: number, position: number) =>
      entry(`${driver} & ${passenger}`, n, position, {
        riders: [{ name: driver }, { name: passenger }],
      });
    const t = withLicences([
      [
        round({
          Sidecar: [pair('Ash Moor', 'Bo Lake', 1, 1), pair('Cy Dunn', 'Di Reed', 2, 2)],
        }),
        { 1: ['A1', 'B2'], 2: ['C3', null] },
      ],
      [
        round({
          Sidecar: [pair('Ashley Moor', 'Bo Lake', 3, 2), pair('Cy Dunn', 'Di Reed', 4, 1)],
        }),
        { 3: ['a1', 'b2'], 4: ['C3', 'D4'] },
      ],
    ]);
    expect(lines(t)).toEqual([
      ['Sidecar', 'Ashley Moor & Bo Lake', [25, 22], 47],
      // One rider without a licence in round 1: matched by names, as now.
      ['Sidecar', 'Cy Dunn & Di Reed', [22, 25], 47],
    ]);
  });

  it('never puts a licence number in the tally, its checks, the CSV or the printable page', () => {
    const t = withLicences([
      [
        round({ T1: [entry('Sam Stone', 4, 1), entry('Jo Park', 1, 2)] }),
        { 4: ['ZQ-90817'], 1: ['ZQ-55501'] },
      ],
      [
        round({ T1: [entry('Samuel Stone', 17, 1), entry('Jo Park', 2, 2)] }),
        { 17: ['ZQ-90817'], 2: ['ZQ-55502'] },
      ],
    ]);
    const opts = { name: 'Winter Series', roundLabels: ['Rd 1', 'Rd 2'], rules, footer: 'tScore' };
    const outputs = [JSON.stringify(t), seriesCsv(t, opts), seriesHtml(t, opts)];
    expect(t.checks).toHaveLength(2);
    for (const out of outputs) {
      expect(out).toContain('Samuel Stone');
      for (const licence of ['ZQ-90817', 'ZQ-55501', 'ZQ-55502', '90817', '55501', '55502'])
        expect(out).not.toContain(licence);
    }
  });
});
