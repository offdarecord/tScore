import { describe, expect, it } from 'vitest';
import { computeSeries, seriesHtml } from '../series.js';
import { computeResults } from './compute.js';
import { DEMO_EVENT, DEMO_OPTIONS } from './demo-event.test-fixture.js';
import { headHtml, resultsHtml } from './output.js';

const CLUB = 'data:image/png;base64,Q0xVQg==';
const EVENT = 'data:image/png;base64,RVZFTlQ=';
const { results } = computeResults(DEMO_EVENT, DEMO_OPTIONS);

describe('the club logo in the header (#111)', () => {
  it('puts the club left and the event right of the title when there are both', () => {
    const html = headHtml({ club: CLUB, event: EVENT }, '<h1>T</h1>');
    expect(html.indexOf(CLUB)).toBeLessThan(html.indexOf('<h1>'));
    expect(html.indexOf(EVENT)).toBeGreaterThan(html.indexOf('<h1>'));
  });

  it('puts a single logo just left of the title, whichever it is', () => {
    for (const logos of [{ club: CLUB }, { event: EVENT }]) {
      const html = headHtml(logos, '<h1>T</h1>');
      expect(html.match(/<img/g)).toHaveLength(1);
      expect(html.indexOf('<img')).toBeLessThan(html.indexOf('<h1>'));
    }
    expect(headHtml(undefined, '<h1>T</h1>')).not.toContain('<img');
  });

  it('is on the results PDF and the series PDF', () => {
    const opts = { dates: 'Sat 6 Feb 2027', footer: 'tScore', gaps: [] };
    expect(resultsHtml(results, { ...opts, logos: { club: CLUB, event: EVENT } })).toContain(CLUB);
    const tally = computeSeries([{ round: 1, results }], { points: [20], ties: 'share' });
    const series = {
      name: 'S',
      roundLabels: ['Rd 1'],
      rules: { points: [20], ties: 'share' as const },
      footer: 'tScore',
    };
    expect(seriesHtml(tally, { ...series, clubLogo: CLUB })).toContain(CLUB);
    expect(seriesHtml(tally, series)).not.toContain('<img class="event-logo"');
  });
});
