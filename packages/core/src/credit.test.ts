import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESULTS_CREDIT_LOGO, RESULTS_CREDIT_URL, creditHtml } from './credit.js';
import { DEMO_EVENT, DEMO_OPTIONS } from './results/demo-event.test-fixture.js';
import { computeResults } from './results/compute.js';
import { resultsHtml } from './results/output.js';
import { computeSeries, seriesHtml } from './series.js';

const count = (text: string, part: string) => text.split(part).length - 1;
const { results } = computeResults(DEMO_EVENT, DEMO_OPTIONS);

describe('the tScore credit (#110)', () => {
  it('is the logo in assets/, small enough not to bloat every PDF', () => {
    const jpeg = readFileSync(join(__dirname, '../../../assets/results-credit.jpg'));
    expect(RESULTS_CREDIT_LOGO).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
    expect(jpeg.length).toBeLessThan(50_000);
  });

  it('ends the results PDF once, below the sponsors, with a clickable link', () => {
    const html = resultsHtml(results, {
      dates: 'Sat 6 Feb 2027',
      footer: 'Produced by tScore',
      gaps: [],
      logos: { sponsors: ['data:image/png;base64,AAAA'] },
    });
    expect(count(html, 'class="credit"')).toBe(1);
    expect(count(html, `href="${RESULTS_CREDIT_URL}"`)).toBe(1);
    expect(count(html, RESULTS_CREDIT_LOGO)).toBe(1);
    expect(html.indexOf('class="credit"')).toBeGreaterThan(html.indexOf('class="sponsors"'));
    expect(html).toContain('Results brought to you by');
  });

  it('ends the series PDF once', () => {
    const tally = computeSeries([{ round: 1, results }], { points: [20, 17], ties: 'share' });
    const html = seriesHtml(tally, {
      name: 'Series',
      roundLabels: ['Rd 1'],
      rules: { points: [20, 17], ties: 'share' },
      footer: 'Produced by tScore',
    });
    expect(count(html, 'class="credit"')).toBe(1);
    expect(count(html, `href="${RESULTS_CREDIT_URL}"`)).toBe(1);
  });

  it('escapes its words', () => {
    expect(creditHtml(() => '<b>')).not.toContain('<b>');
  });
});
