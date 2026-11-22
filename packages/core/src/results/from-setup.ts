import type { EventSetup } from '../generated/event-setup.js';
import { DEFAULT_SCORING, type ClassInput, type ScoringRules } from './model.js';

/**
 * Whether a class name looks like a junior class: it contains the word "junior(s)", "boy(s)" or
 * "girl(s)", in any case. Used as the default when a class isn't explicitly marked.
 */
export function isJuniorClassName(name: string): boolean {
  return /\b(juniors?|boys?|girls?)\b/i.test(name);
}

/**
 * The junior classes in an event setup: those marked `junior: true`, plus those with no mark
 * whose name looks junior ({@link isJuniorClassName}). An explicit `junior: false` always wins.
 * Pass these as `juniorSurnameInitialClasses` when the club's "show junior surnames as an
 * initial" publish option is on.
 */
export function juniorClassesFromSetup(setup: EventSetup): string[] {
  return setup.classes.filter((c) => c.junior ?? isJuniorClassName(c.name)).map((c) => c.name);
}

/** The scoring rules in an event setup, with the defaults filled in. */
export function scoringFromSetup(setup: EventSetup): ScoringRules {
  return {
    scoreValues: setup.scoring?.score_values ?? DEFAULT_SCORING.scoreValues,
    direction: setup.scoring?.direction ?? DEFAULT_SCORING.direction,
    tieBreaks: setup.scoring?.tie_breaks ?? DEFAULT_SCORING.tieBreaks,
  };
}

/**
 * The results engine's view of an event setup's classes: only the days each class rides, with
 * the skipped sections that apply to it. Expects a setup that passed `validateEventSetup`.
 */
export function classesFromSetup(setup: EventSetup): ClassInput[] {
  const skipped = setup.skipped_sections ?? [];
  return setup.classes.map((c) => {
    const appliesTo = (s: (typeof skipped)[number]) =>
      s.classes === undefined ||
      s.classes.some((n) => n.trim().toLowerCase() === c.name.trim().toLowerCase());
    const days = Object.entries(c.days)
      .map(([day, cd]) => ({ day: Number(day), ...cd }))
      .filter((d) => d.laps > 0)
      .sort((a, b) => a.day - b.day)
      .map((d) => {
        const skips = skipped
          .filter((s) => s.day === d.day && appliesTo(s))
          .map((s) => ({ section: s.section, fromLap: s.from_lap }));
        return {
          day: d.day,
          sections: d.sections,
          laps: d.laps,
          ...(skips.length > 0 ? { skipped: skips } : {}),
        };
      });
    return { name: c.name, order: c.order ?? 9000, scored: c.scored ?? true, days };
  });
}
