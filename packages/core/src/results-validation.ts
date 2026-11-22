import type { Entry, Results } from './generated/results.js';
import { validateResultsSchema } from './generated/validators.js';
import { checkSchema, type ValidationIssue, type ValidationResult } from './validation.js';

/**
 * Validate a results payload (`tscore.results/1`): the schema, then that the numbers add up
 * and the placings make sense. Useful to producers (golden-event tests) and to consumers
 * such as a results website.
 */
export function validateResults(data: unknown): ValidationResult<Results> {
  const schema = checkSchema<Results>(validateResultsSchema, data);
  if (!schema.ok) return schema;

  const issues = checkResultsRules(schema.value);
  return issues.length ? { ok: false, issues } : schema;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function checkResultsRules(results: Results): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const scoreValues = new Set(results.event.scoring.score_values);
  const eventDays = new Set(results.event.days.map((d) => d.day));

  results.classes.forEach((cls, ci) => {
    const classPath = `classes[${ci}]`;
    const classDays = new Map(cls.days.map((d) => [d.day, d]));
    cls.days.forEach((d, di) => {
      if (!eventDays.has(d.day))
        add(`${classPath}.days[${di}].day`, `day ${d.day} is not an event day`);
    });

    const numbers = new Set<number>();
    cls.entries.forEach((entry, ei) => {
      const path = `${classPath}.entries[${ei}]`;
      if (numbers.has(entry.number))
        add(`${path}.number`, `rider ${entry.number} appears twice in ${cls.name}`);
      numbers.add(entry.number);
      checkPlacing(entry, path, add);
      checkScores(entry, path, classDays, scoreValues, add);
    });
  });

  return issues;
}

function checkPlacing(entry: Entry, path: string, add: (p: string, m: string) => void): void {
  const placed = entry.tier === 'competitive' && entry.status === 'finished';
  if (placed && entry.position === null)
    add(`${path}.position`, 'a competitive finisher needs a position');
  if (!placed && entry.position !== null) {
    add(`${path}.position`, 'only competitive finishers have a position (use null)');
  }
  const ranked = entry.tier !== 'competitive' && entry.status === 'finished';
  if (!ranked && entry.rank_in_tier != null) {
    add(`${path}.rank_in_tier`, 'only No Award and non-competitive finishers have rank_in_tier');
  }
  if (entry.tier === 'non_competitive' || entry.tier === 'no_award') {
    if (entry.ride_off !== undefined)
      add(`${path}.ride_off`, 'ride-offs only decide competitive placings');
  }
}

function checkScores(
  entry: Entry,
  path: string,
  classDays: Map<number, { sections: number; laps: number }>,
  scoreValues: Set<number>,
  add: (p: string, m: string) => void,
): void {
  if (entry.status === 'dns') {
    if (entry.total !== null) add(`${path}.total`, 'a DNS entry has no total (use null)');
    if (entry.days?.length) add(`${path}.days`, 'a DNS entry has no scores');
    return;
  }
  if (entry.total === null) {
    add(`${path}.total`, 'needs a total');
    return;
  }

  const tally = new Map<number, number>();
  const dayTotals: number[] = [];
  (entry.days ?? []).forEach((day, di) => {
    const dayPath = `${path}.days[${di}]`;
    const config = classDays.get(day.day);
    if (!config) add(`${dayPath}.day`, `the class doesn't ride day ${day.day}`);
    const lapTotals: number[] = [];
    day.laps.forEach((lap, li) => {
      const lapPath = `${dayPath}.laps[${li}]`;
      if (config && lap.lap > config.laps)
        add(`${lapPath}.lap`, `the class rides only ${config.laps} lap(s) on day ${day.day}`);
      if (lap.sections === null) {
        if (lap.total !== null) add(`${lapPath}.total`, 'a lap not ridden has no total (use null)');
        return;
      }
      if (config && lap.sections.length !== config.sections) {
        add(
          `${lapPath}.sections`,
          `has ${lap.sections.length} scores but the class rides ${config.sections} sections`,
        );
      }
      const scored = lap.sections.filter((s): s is number => s !== null);
      scored.forEach((s) => {
        if (!scoreValues.has(s)) add(`${lapPath}.sections`, `${s} is not a valid score`);
        tally.set(s, (tally.get(s) ?? 0) + 1);
      });
      const expected = sum(scored);
      if (lap.total !== expected)
        add(`${lapPath}.total`, `is ${String(lap.total)} but the sections add up to ${expected}`);
      lapTotals.push(expected);
    });
    if (day.total !== sum(lapTotals))
      add(`${dayPath}.total`, `is ${day.total} but the laps add up to ${sum(lapTotals)}`);
    dayTotals.push(sum(lapTotals));
  });

  const penalties = sum((entry.penalties ?? []).map((p) => p.points));
  const expectedTotal = sum(dayTotals) + penalties;
  if (entry.total !== expectedTotal) {
    add(
      `${path}.total`,
      `is ${entry.total} but the days plus penalties add up to ${expectedTotal}`,
    );
  }

  if (entry.counts) {
    for (const value of scoreValues) {
      const stated = entry.counts[String(value)] ?? 0;
      const actual = tally.get(value) ?? 0;
      if (stated !== actual)
        add(`${path}.counts.${value}`, `is ${stated} but the sections contain ${actual}`);
    }
  }
}
