import { describe, expect, it } from 'vitest';
import type { Entry, Results } from '../generated/results.js';
import { computeResults } from './compute.js';
import { DEMO_EVENT, DEMO_OPTIONS } from './demo-event.test-fixture.js';
import {
  BOM,
  gapWords,
  lapColumns,
  ordinal,
  placeChanges,
  placeLabels,
  resultsCsv,
  resultsHtml,
  tieBreakWords,
} from './output.js';

const report = computeResults(DEMO_EVENT, DEMO_OPTIONS);
const trial2 = () => {
  const c = report.results.classes.find((x) => x.name === 'Trial 2');
  if (!c) throw new Error('no Trial 2');
  return c;
};

const entry = (over: Partial<Entry>): Entry => ({
  number: 1,
  riders: [{ name: 'A B' }],
  competition_status: 'competitive',
  status: 'finished',
  position: 1,
  total: 0,
  ...over,
});

describe('place labels', () => {
  it('writes ordinals the Australian way', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ]); // prettier-ignore
  });

  it('marks every rider in a shared placing, and names the other groups', () => {
    expect(
      placeLabels([
        entry({ position: 1 }),
        entry({ position: 2 }),
        entry({ position: 2, tied_with_previous: true }),
        entry({ position: 4 }),
        entry({ competition_status: 'no_award', position: null }),
        entry({ competition_status: 'non_competitive', position: null, total: null }),
        entry({ status: 'dnf', position: null }),
        entry({ status: 'dns', position: null, total: null }),
      ]),
    ).toEqual(['1st', '2nd=', '2nd=', '4th', 'NA', 'NC', 'DNF', 'DNS']);
  });
});

describe('the results CSV', () => {
  const csv = resultsCsv(report.results);
  const lines = csv.slice(BOM.length).trimEnd().split('\r\n');

  it('starts with a byte-order mark so Excel reads names with accents correctly', () => {
    expect(csv.startsWith(BOM)).toBe(true);
    expect(lines[0]).toBe(
      'Class,Place,Number,Name,Club,Status,Lap 1,Lap 2,Penalties,Total,0s,1s,2s,3s,5s',
    );
  });

  it("leaves out a non-competitive rider's lap scores, penalties and total, keeping counts", () => {
    const nc = lines.find((l) => l.includes(',Pat Test,'));
    expect(nc).toMatch(/^Trial 2,NC,4,Pat Test,,,,,,,\d+,\d+,\d+,\d+,\d+$/);
  });

  it('has one row per entry per class', () => {
    const entries = report.results.classes.reduce((n, c) => n + c.entries.length, 0);
    expect(lines).toHaveLength(entries + 1);
  });

  it("doesn't let a name or club run as a spreadsheet formula", () => {
    const sneaky: Results = {
      ...report.results,
      classes: [
        {
          ...trial2(),
          entries: [entry({ riders: [{ name: '=HYPERLINK("x")' }], club: '+Club, Inc' })],
        },
      ],
    };
    expect(resultsCsv(sneaky)).toContain(`"'=HYPERLINK(""x"")","'+Club, Inc"`);
  });
});

describe('the printable results (PDF)', () => {
  const html = resultsHtml(report.results, { gaps: [], dates: 'Sat 6 Feb 2027', footer: 'tScore' });

  it('has a table per class with that class’s lap columns', () => {
    expect(lapColumns(trial2()).map((c) => c.label)).toEqual(['Lap 1', 'Lap 2']);
    expect(html).toContain('<h2>Trial 2 <span>5 sections × 2 laps');
    expect(html).not.toContain('PROVISIONAL');
  });

  it("never contains a non-competitive rider's scores", () => {
    const row = /<tr[^>]*>(?:(?!<\/tr>).)*Pat Test(?:(?!<\/tr>).)*<\/tr>/s.exec(html)?.[0] ?? '';
    expect(row).toContain('>NC<');
    // Place, number, name, club, two empty laps, empty penalty, empty total, then the counts.
    expect(row).toMatch(
      /<td class="n"><\/td><td class="n"><\/td><td class="n"><\/td><td class="n total"><\/td>/,
    );
  });

  it('is marked provisional, saying why, while cards are missing', () => {
    const gaps = [
      { kind: 'missing_card', number: 1, className: 'Trial 2', day: 1, lap: 2 },
      { kind: 'missing_card', number: 1, className: 'Trial 3', day: 1, lap: 2 },
      { kind: 'undecided_score', number: 2, className: 'Trial 2', day: 1, lap: 1, section: 3 },
    ] as const;
    expect(gapWords(gaps)).toBe('1 card still missing and 1 score undecided.');
    expect(resultsHtml(report.results, { gaps, dates: '', footer: '' })).toContain(
      'PROVISIONAL: 1 card still missing and 1 score undecided. Positions may change.',
    );
  });

  it('escapes names, so a name can never become markup', () => {
    const odd: Results = {
      ...report.results,
      classes: [{ ...trial2(), entries: [entry({ riders: [{ name: '<b>Al & Co</b>' }] })] }],
    };
    const out = resultsHtml(odd, { gaps: [], dates: '', footer: '' });
    expect(out).toContain('&lt;b&gt;Al &amp; Co&lt;/b&gt;');
    expect(out).not.toContain('<b>Al');
  });

  it('shows the event logo by the title and sponsors at the end, and nothing but pictures', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const jpg = 'data:image/jpeg;base64,/9j/4AAQ';
    const out = resultsHtml(report.results, {
      gaps: [],
      dates: '',
      footer: '',
      logos: { event: png, sponsors: [jpg, 'data:text/html;base64,PHNjcmlwdD4=', 'x" onerror="y'] },
    });
    expect(out).toContain(`<img class="event-logo" src="${png}" alt="">`);
    expect(out).toContain(
      `Supported by</p><div><img class="sponsor-logo" src="${jpg}" alt=""></div>`,
    );
    expect(out).not.toContain('text/html');
    expect(out).not.toContain('onerror');
    expect(html).not.toContain('Supported by');
  });

  it('explains the tie-break rule in words', () => {
    expect(tieBreakWords(report.results)).toBe(
      'Lowest total wins. Ties are split by most 0s, then most 1s, then most 2s, then most 3s, then fewest 5s, then a ride-off.',
    );
  });
});

describe('final results and revisions', () => {
  const final = (revision: number, event = DEMO_EVENT) =>
    computeResults(event, { ...DEMO_OPTIONS, status: 'final', revision }).results;

  it('prints FINAL instead of PROVISIONAL, with the revision from 2 on', () => {
    const html = resultsHtml(final(1), { gaps: [], dates: '', footer: '' });
    expect(html).toContain('FINAL RESULTS');
    expect(html).not.toContain('REVISION');
    expect(html).not.toContain('PROVISIONAL');
    const revised = resultsHtml(final(2), {
      gaps: [],
      dates: '',
      footer: '',
      revisionNote: {
        replaces: 1,
        replacedAt: 'Sat 6 Feb 2027 17:05',
        reason: 'Rider 2 <card misread>',
        changes: ['Trial 2: rider 2, 2nd → 1st'],
      },
    });
    expect(revised).toContain('FINAL RESULTS · REVISION 2');
    expect(revised).toContain('Replaces revision 1 of Sat 6 Feb 2027 17:05.');
    expect(revised).toContain('Rider 2 &lt;card misread&gt;');
    expect(revised).toContain('<li>Trial 2: rider 2, 2nd → 1st</li>');
  });

  it('lists the places that changed, and riders added or removed', () => {
    const before = final(1);
    expect(placeChanges(before, before)).toEqual([]);
    // A big penalty on rider 1 moves them down; everyone they passed moves up.
    const event = {
      ...DEMO_EVENT,
      entries: DEMO_EVENT.entries.map((e) =>
        e.number === 1
          ? { ...e, penalties: [...(e.penalties ?? []), { points: 50, reason: 'time' as const }] }
          : e,
      ),
    };
    const changes = placeChanges(before, final(2, event));
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.some((c) => c.includes('rider 1,') && c.includes('→'))).toBe(true);
    const fewer = {
      ...before,
      classes: before.classes.map((c) => ({
        ...c,
        entries: c.entries.filter((e) => e.number !== 1),
      })),
    };
    expect(placeChanges(before, fewer).some((c) => c.endsWith('removed'))).toBe(true);
  });
});
