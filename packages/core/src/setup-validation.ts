import { CARD_PROFILES, cardProfile, DEFAULT_CARD_PROFILE } from './card-profiles.js';
import type { EventSetup } from './generated/event-setup.js';
import { validateEventSetupSchema } from './generated/validators.js';
import {
  checkSchema,
  joinPath,
  type ValidationIssue,
  type ValidationResult,
} from './validation.js';

/**
 * Section rows on each known card profile (presets/card-profiles/). A class can't ride more
 * sections per lap than the card has rows.
 */
export const CARD_PROFILE_ROWS: Readonly<Record<string, number>> = Object.fromEntries(
  CARD_PROFILES.map((p) => [p.id, p.rows]),
);

export { DEFAULT_CARD_PROFILE };

/**
 * Validate an event setup (`tscore.event_setup/1`): first against the schema, then the rules
 * that span fields. Returns every problem found, not just the first.
 */
export function validateEventSetup(data: unknown): ValidationResult<EventSetup> {
  const schema = checkSchema<EventSetup>(validateEventSetupSchema, data);
  if (!schema.ok) return schema;

  const issues = checkSetupRules(schema.value);
  return issues.length ? { ok: false, issues } : schema;
}

function checkSetupRules(setup: EventSetup): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  // Days are numbered 1, 2, 3 ... in order.
  const dayNumbers = setup.days.map((d) => d.day);
  dayNumbers.forEach((n, i) => {
    if (n !== i + 1)
      add(
        joinPath(joinPath('days', i), 'day'),
        `should be ${i + 1} (days are numbered 1, 2, 3 … in order)`,
      );
  });
  const days = new Set(dayNumbers);

  // The scorecard limits sections per lap.
  const profile = setup.event.card_profile ?? DEFAULT_CARD_PROFILE;
  const cardRows = cardProfile(profile)?.rows;
  if (cardRows === undefined) {
    add('event.card_profile', `unknown card profile "${profile}"`);
  }

  // Score values used by tie-breaks must exist.
  const scoreValues = new Set(setup.scoring?.score_values ?? [0, 1, 2, 3, 5]);
  const tieBreaks = setup.scoring?.tie_breaks;
  if (tieBreaks) {
    if (tieBreaks[0] !== 'total')
      add('scoring.tie_breaks[0]', 'the first tie-break must be "total"');
    tieBreaks.forEach((t, i) => {
      const m = /^(?:most|fewest)_(\d+)$/.exec(t);
      if (m && !scoreValues.has(Number(m[1]))) {
        add(
          `scoring.tie_breaks[${i}]`,
          `"${t}" uses score ${m[1]}, which is not one of the score values`,
        );
      }
    });
  }

  // Classes: unique names, unambiguous aliases, sensible laps and sections per day.
  const nameOwner = new Map<string, string>();
  setup.classes.forEach((c, i) => {
    const key = c.name.trim().toLowerCase();
    if (nameOwner.has(key))
      add(joinPath(joinPath('classes', i), 'name'), `class "${c.name}" is listed twice`);
    else nameOwner.set(key, c.name);
  });
  setup.classes.forEach((c, i) => {
    (c.aliases ?? []).forEach((alias, j) => {
      const owner = nameOwner.get(alias.trim().toLowerCase());
      if (owner !== undefined && owner.toLowerCase() !== c.name.trim().toLowerCase()) {
        add(`classes[${i}].aliases[${j}]`, `"${alias}" is already the name of class "${owner}"`);
      }
    });
  });
  const aliasOwner = new Map<string, string>();
  setup.classes.forEach((c, i) => {
    (c.aliases ?? []).forEach((alias, j) => {
      const key = alias.trim().toLowerCase();
      const owner = aliasOwner.get(key);
      if (owner !== undefined && owner !== c.name) {
        add(`classes[${i}].aliases[${j}]`, `alias "${alias}" is also used by class "${owner}"`);
      } else aliasOwner.set(key, c.name);
    });
  });

  let anyLapsRidden = false;
  setup.classes.forEach((c, i) => {
    for (const [dayKey, cd] of Object.entries(c.days)) {
      const path = `classes[${i}].days.${dayKey}`;
      if (!days.has(Number(dayKey))) {
        add(
          path,
          `class "${c.name}" has settings for day ${dayKey}, but the event has ${days.size} day(s)`,
        );
        continue;
      }
      if (cd.laps === 0) continue;
      if (c.scored === false) {
        add(path, `class "${c.name}" is not scored, so it can't ride laps`);
        continue;
      }
      anyLapsRidden = true;
      if (cd.sections < 1) {
        add(
          joinPath(path, 'sections'),
          `class "${c.name}" rides ${cd.laps} lap(s) on day ${dayKey} but has no sections`,
        );
      } else if (cardRows !== undefined && cd.sections > cardRows) {
        add(
          joinPath(path, 'sections'),
          `class "${c.name}" has ${cd.sections} sections on day ${dayKey}, but the ${profile} card has only ${cardRows} rows`,
        );
      }
    }
  });
  if (!anyLapsRidden) add('classes', 'no class rides any laps');

  // Skipped sections must point at a real day, class, section and lap.
  (setup.skipped_sections ?? []).forEach((s, i) => {
    const path = `skipped_sections[${i}]`;
    if (!days.has(s.day)) {
      add(joinPath(path, 'day'), `day ${s.day} is not an event day`);
      return;
    }
    const affected = s.classes
      ? s.classes.flatMap((name, j) => {
          const cls = setup.classes.find(
            (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase(),
          );
          if (!cls) add(`${path}.classes[${j}]`, `"${name}" is not a class in this event`);
          return cls ? [cls] : [];
        })
      : setup.classes;
    const riding = affected
      .map((c) => c.days[String(s.day)])
      .filter((cd): cd is NonNullable<typeof cd> => cd !== undefined && cd.laps > 0);
    if (riding.length === 0) {
      if (affected.length) add(path, `no affected class rides on day ${s.day}`);
      return;
    }
    const maxSections = Math.max(...riding.map((cd) => cd.sections));
    const maxLaps = Math.max(...riding.map((cd) => cd.laps));
    if (s.section > maxSections)
      add(joinPath(path, 'section'), `section ${s.section} doesn't exist on day ${s.day}`);
    if (s.from_lap > maxLaps)
      add(joinPath(path, 'from_lap'), `lap ${s.from_lap} isn't ridden on day ${s.day}`);
  });

  return issues;
}
