import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateEventSetup } from './setup-validation.js';

const example = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(new URL(`../../../schemas/examples/${name}`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>;

/** A deep copy of the two-day example, changed by `edit`. */
function twoDay(edit: (s: any) => void): unknown {
  const s = structuredClone(example('event_setup.two-day.json'));
  edit(s);
  return s;
}

function messages(data: unknown): string[] {
  const r = validateEventSetup(data);
  return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);
}

describe('validateEventSetup', () => {
  it.each(['event_setup.two-day.json', 'event_setup.minimal.json'])('accepts %s', (file) => {
    expect(messages(example(file))).toEqual([]);
  });

  it('rejects the wrong schema id', () => {
    expect(messages(twoDay((s) => (s.schema = 'tscore.event_setup/2')))).toEqual([
      'schema: must be "tscore.event_setup/1"',
    ]);
  });

  it('reports unknown fields by name', () => {
    expect(messages(twoDay((s) => (s.event.dob = 'x')))).toEqual(['event: unknown field "dob"']);
  });

  it('rejects event codes that would break the label QR code', () => {
    expect(messages(twoDay((s) => (s.event.code = 'ss;r1')))[0]).toMatch(/^event\.code:/);
  });

  it('requires days numbered 1, 2, ...', () => {
    expect(messages(twoDay((s) => (s.days[1].day = 3)))).toContain(
      'days[1].day: should be 2 (days are numbered 1, 2, 3 … in order)',
    );
  });

  it('rejects duplicate class names, ignoring case', () => {
    expect(messages(twoDay((s) => (s.classes[1].name = 'trial 1')))).toContain(
      'classes[1].name: class "trial 1" is listed twice',
    );
  });

  it('rejects an alias shared by two classes', () => {
    expect(messages(twoDay((s) => (s.classes[2].aliases = ['Trial 1 (A+ Grade)'])))).toContain(
      'classes[2].aliases[0]: alias "Trial 1 (A+ Grade)" is also used by class "Trial 1"',
    );
  });

  it('rejects more sections than the regional card has rows', () => {
    expect(messages(twoDay((s) => (s.classes[0].days['2'].sections = 17)))).toEqual([
      'classes[0].days.2.sections: class "Trial 1" has 17 sections on day 2, but the regional-16 card has only 16 rows',
    ]);
  });

  it('rejects laps with no sections', () => {
    expect(messages(twoDay((s) => (s.classes[3].days['1'].sections = 0)))).toContain(
      'classes[3].days.1.sections: class "Beginners" rides 3 lap(s) on day 1 but has no sections',
    );
  });

  it('rejects settings for a day the event does not have', () => {
    expect(messages(twoDay((s) => (s.classes[3].days['3'] = { sections: 8, laps: 2 })))).toContain(
      'classes[3].days.3: class "Beginners" has settings for day 3, but the event has 2 day(s)',
    );
  });

  it('rejects laps for a class that is not scored', () => {
    expect(
      messages(twoDay((s) => (s.classes[5].days = { '1': { sections: 10, laps: 1 } }))),
    ).toContain('classes[5].days.1: class "Minder" is not scored, so it can\'t ride laps');
  });

  it('rejects an unknown card profile', () => {
    expect(messages(twoDay((s) => (s.event.card_profile = 'nsw-20')))).toContain(
      'event.card_profile: unknown card profile "nsw-20"',
    );
  });

  it('requires total as the first tie-break and known score values', () => {
    const m = messages(twoDay((s) => (s.scoring.tie_breaks = ['most_0', 'total', 'most_4'])));
    expect(m).toContain('scoring.tie_breaks[0]: the first tie-break must be "total"');
    expect(m).toContain(
      'scoring.tie_breaks[2]: "most_4" uses score 4, which is not one of the score values',
    );
  });

  it('checks skipped sections against the setup', () => {
    const m = messages(
      twoDay((s) =>
        s.skipped_sections.push(
          { day: 1, section: 11, from_lap: 1 },
          { day: 2, section: 2, from_lap: 4, classes: ['Juniors', 'Nobody'] },
        ),
      ),
    );
    expect(m).toContain("skipped_sections[1].section: section 11 doesn't exist on day 1");
    expect(m).toContain('skipped_sections[2].classes[1]: "Nobody" is not a class in this event');
    expect(m).toContain("skipped_sections[2].from_lap: lap 4 isn't ridden on day 2");
  });

  it('reports every problem, not just the first', () => {
    const m = messages(
      twoDay((s) => {
        s.classes[0].days['1'].sections = 20;
        s.classes[1].days['1'].sections = 20;
      }),
    );
    expect(m).toHaveLength(2);
  });
});
