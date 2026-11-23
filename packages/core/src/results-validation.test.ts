import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateResults } from './results-validation.js';

const EXAMPLE = JSON.parse(
  readFileSync(new URL('../../../schemas/examples/results.one-day.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

function edited(edit: (r: any) => void): unknown {
  const r = structuredClone(EXAMPLE);
  edit(r);
  return r;
}

function messages(data: unknown): string[] {
  const r = validateResults(data);
  return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);
}

// classes[0] is Trial 2; entries[0] is rider 2 (1st), entries[2] rider 3 (penalty),
// entries[3] rider 5 (DNF), entries[4] rider 4 (NC), entries[5] rider 6 (DNS).

describe('validateResults', () => {
  it('accepts the example payload', () => {
    expect(messages(EXAMPLE)).toEqual([]);
  });

  it('rejects personal data fields that the format does not allow', () => {
    expect(messages(edited((r) => (r.classes[0].entries[0].licence = 'X123')))[0]).toBe(
      'classes[0].entries[0]: unknown field "licence"',
    );
  });

  it('checks lap totals against the sections', () => {
    expect(
      messages(edited((r) => (r.classes[0].entries[0].days[0].laps[0].sections[4] = 5))),
    ).toEqual(
      expect.arrayContaining([
        'classes[0].entries[0].days[0].laps[0].total: is 4 but the sections add up to 6',
        'classes[0].entries[0].counts.3: is 1 but the sections contain 0',
        'classes[0].entries[0].counts.5: is 0 but the sections contain 1',
      ]),
    );
  });

  it('includes penalties in the event total', () => {
    expect(messages(edited((r) => (r.classes[0].entries[2].total = 1)))).toEqual([
      'classes[0].entries[2].total: is 1 but the days plus penalties add up to 6',
    ]);
  });

  it('rejects scores that are not score values', () => {
    expect(
      messages(
        edited((r) => {
          const lap = r.classes[1].entries[0].days[0].laps[0];
          lap.sections[0] = 4;
          lap.total = 5;
          r.classes[1].entries[0].days[0].total = 5;
          r.classes[1].entries[0].total = 5;
        }),
      ),
    ).toContain('classes[1].entries[0].days[0].laps[0].sections: 4 is not a valid score');
  });

  it('only gives positions to competitive finishers', () => {
    const m = messages(
      edited((r) => {
        r.classes[0].entries[3].position = 4; // DNF
        r.classes[0].entries[4].position = 5; // NC
        r.classes[0].entries[0].position = null; // winner
      }),
    );
    expect(m).toContain(
      'classes[0].entries[3].position: only competitive finishers have a position (use null)',
    );
    expect(m).toContain(
      'classes[0].entries[4].position: only competitive finishers have a position (use null)',
    );
    expect(m).toContain('classes[0].entries[0].position: a competitive finisher needs a position');
  });

  it('gives DNS entries no scores', () => {
    expect(messages(edited((r) => (r.classes[0].entries[4].total = 0)))).toEqual([
      'classes[0].entries[4].total: a DNS entry has no total (use null)',
    ]);
  });

  it("never publishes a non-competitive rider's scores", () => {
    const nc = 'classes[0].entries[5]';
    expect(
      messages(
        edited((r) => {
          const e = r.classes[0].entries[5];
          e.total = 15;
          e.days = [{ day: 1, total: 15, laps: [] }];
          e.penalties = [{ points: 5, reason: 'other' }];
        }),
      ),
    ).toEqual([
      `${nc}.total: a non-competitive entry has no total (use null)`,
      `${nc}.days: a non-competitive entry has no published scores`,
      `${nc}.penalties: a non-competitive entry has no published penalties`,
    ]);
  });

  it('checks section counts against the class setup', () => {
    expect(
      messages(edited((r) => r.classes[2].entries[0].days[0].laps[1].sections.push(0))),
    ).toContain(
      'classes[2].entries[0].days[0].laps[1].sections: has 6 scores but the class rides 5 sections',
    );
  });

  it('rejects a rider listed twice in a class', () => {
    expect(messages(edited((r) => (r.classes[0].entries[1].number = 2)))).toContain(
      'classes[0].entries[1].number: rider 2 appears twice in Trial 2',
    );
  });
});
