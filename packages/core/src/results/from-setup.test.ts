import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EventSetup } from '../generated/event-setup.js';
import { classesFromSetup, juniorClassesFromSetup, scoringFromSetup } from './from-setup.js';
import { DEFAULT_SCORING } from './model.js';

const load = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../schemas/examples/${name}`, import.meta.url), 'utf8'),
  ) as EventSetup;

describe('classesFromSetup', () => {
  const classes = classesFromSetup(load('event_setup.two-day.json'));
  const byName = (n: string) => classes.find((c) => c.name === n)!;

  it('keeps only the days a class rides, with the skipped section on day 1', () => {
    expect(byName('Beginners').days).toEqual([
      { day: 1, sections: 8, laps: 3, skipped: [{ section: 6, fromLap: 3 }] },
    ]);
    expect(byName('Juniors').days.map((d) => [d.day, d.sections, d.laps])).toEqual([
      [1, 10, 3],
      [2, 12, 2],
    ]);
  });

  it('marks minders as not scored', () => {
    expect(byName('Minder')).toEqual({ name: 'Minder', order: 9999, scored: false, days: [] });
  });

  it('lists the classes marked junior, and none when no class is marked', () => {
    expect(juniorClassesFromSetup(load('event_setup.two-day.json'))).toEqual(['Juniors']);
    expect(juniorClassesFromSetup(load('event_setup.minimal.json'))).toEqual([]);
  });

  it('fills in default scoring rules', () => {
    expect(scoringFromSetup(load('event_setup.minimal.json'))).toEqual(DEFAULT_SCORING);
  });
});
