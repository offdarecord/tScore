/**
 * Step 2 of rider import: turn the entry list into numbered riders for this event.
 *
 * A pure function of the entry list, the event setup, the riders already entered and the
 * desk's choices, so the screen can show the result of every choice straight away, and the
 * main process can work out exactly the same thing again before saving.
 */
import type { EventSetup } from '../generated/event-setup.js';
import { classesFromSetup } from '../results/from-setup.js';
import {
  MACHINE_MAX,
  type CompetitionStatus,
  type EntryInput,
  type PersonInput,
} from '../results/model.js';
import type { EntryList, SourceRow } from './extract.js';
import { IMPORT_PRESETS, matcher, norm, type ImportMapping } from './presets.js';

/** What the desk decided where tScore couldn't. */
export interface ImportChoices {
  /** Entry-list class name → event class, or null to leave those riders out. */
  readonly classes?: Readonly<Record<string, string | null>>;
  /** Entry-list class names whose choice is not saved as an alias (saved by default). */
  readonly dontKeep?: readonly string[];
  /** For a person entered in more than one class: the one class they ride, or two (second class). */
  readonly duplicates?: Readonly<Record<string, readonly string[]>>;
}

export type MatchedBy =
  | 'name' // the event's class name
  | 'event_alias' // an alias saved in this event's setup
  | 'preset' // the entry system's known class names
  | 'tidy' // the name with "(…)" removed and "4+" read as "4 Plus"
  | 'chosen' // the desk picked it
  | 'left_out' // the desk chose to leave these riders out
  | 'unknown';

export interface ClassMatch {
  /** The class name as the entry list has it. */
  readonly raw: string;
  readonly riders: number;
  readonly className: string | null;
  readonly by: MatchedBy;
}

/** Someone entered in two or more classes: one class, or a second-class entry? */
export interface Duplicate {
  readonly key: string;
  readonly name: string;
  readonly classes: readonly string[];
  readonly chosen: readonly string[] | null;
}

export interface ImportPlan {
  readonly source: string;
  /** Rows with a rider's name on them. */
  readonly rowsRead: number;
  /** Rows that aren't riders, by reason ("observers", "crew", …). */
  readonly skipped: readonly { readonly reason: string; readonly count: number }[];
  readonly classes: readonly ClassMatch[];
  /** Extra rows for the same person in the same class, merged into one. */
  readonly merged: number;
  readonly duplicates: readonly Duplicate[];
  /** People already in the event (same licence, or same name), left as they are. */
  readonly alreadyEntered: number;
  /** The new riders, numbered, in number order. */
  readonly entries: readonly EntryInput[];
  readonly numbering: 'generated' | 'from_file';
  /** Things worth knowing that don't stop the import. */
  readonly notes: readonly string[];
  /** Aliases to save in the event setup: entry-list name → event class. */
  readonly newAliases: readonly { readonly className: string; readonly alias: string }[];
  /** Nothing left for the desk to decide, and at least one rider to add. */
  readonly ready: boolean;
}

interface Person {
  key: string;
  given: string;
  family: string;
  club?: string;
  machine?: string;
  licence?: string;
  competitionStatus: CompetitionStatus;
  classes: string[];
  number?: number;
}

export function planImport(
  list: EntryList,
  setup: EventSetup,
  existing: readonly EntryInput[],
  choices: ImportChoices = {},
  presets: readonly ImportMapping[] = IMPORT_PRESETS,
): ImportPlan {
  const preset = presets.find((p) => p.id === list.presetId);
  if (!preset) throw new Error(`Unknown import preset ${list.presetId}`);
  const has = new Set(list.fields);
  const skipRules = (preset.skip_rows ?? [])
    .filter((r) => has.has(r.field))
    .map((r) => ({ reason: r.reason, m: matcher(r) }));
  const competitionStatusRules = (preset.competition_status_rules ?? [])
    .filter((r) => has.has(r.field))
    .map((r) => ({ competitionStatus: r.competition_status, m: matcher(r) }));

  // 1. Rows that aren't riders.
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const riders: SourceRow[] = [];
  let rowsRead = 0;
  for (const row of list.rows) {
    if (!row.given_name && !row.family_name) continue;
    rowsRead++;
    const rule = skipRules.find((r) => r.m.test(row[r.m.field] ?? ''));
    if (rule) skip(rule.reason);
    else if (!row.class) skip('no class');
    else riders.push(row);
  }

  // 2. Classes.
  const resolver = classResolver(setup, preset);
  const counts = new Map<string, number>();
  for (const r of riders) counts.set(r.class ?? '', (counts.get(r.class ?? '') ?? 0) + 1);
  const classes: ClassMatch[] = [...counts].map(([raw, n]) => {
    const choice = Object.entries(choices.classes ?? {}).find(([k]) => norm(k) === norm(raw));
    if (choice) {
      const [, picked] = choice;
      if (picked === null) return { raw, riders: n, className: null, by: 'left_out' };
      const name = resolver.exact(picked);
      if (name) return { raw, riders: n, className: name, by: 'chosen' };
    }
    const auto = resolver.resolve(raw);
    return { raw, riders: n, className: auto?.name ?? null, by: auto?.by ?? 'unknown' };
  });
  const classOf = new Map(classes.map((c) => [norm(c.raw), c]));
  const newAliases = classes
    .filter((c) => c.by === 'chosen' && c.className)
    .filter((c) => !(choices.dontKeep ?? []).some((d) => norm(d) === norm(c.raw)))
    .map((c) => ({ className: c.className ?? '', alias: c.raw }));

  // 3. People: one per licence number (or name, without one), with their classes.
  const people = new Map<string, Person>();
  let merged = 0;
  for (const row of riders) {
    const match = classOf.get(norm(row.class ?? ''));
    if (match?.by === 'left_out') {
      skip('classes left out');
      continue;
    }
    const given = tidyName(row.given_name ?? '');
    const family = tidyName(row.family_name ?? '');
    const licence = cleanLicence(row.licence);
    const key = licence ? `L:${norm(licence)}` : `N:${norm(given)}|${norm(family)}`;
    const cls = match?.className ?? `?${row.class ?? ''}`;
    const number = parseNumber(row.number);
    const p = people.get(key);
    if (!p) {
      people.set(key, {
        key,
        given,
        family,
        ...(row.club ? { club: row.club } : {}),
        ...machineOf(row),
        ...(licence ? { licence } : {}),
        competitionStatus:
          competitionStatusRules.find((t) => t.m.test(row[t.m.field] ?? ''))?.competitionStatus ??
          'competitive',
        classes: [cls],
        ...(number !== undefined ? { number } : {}),
      });
    } else if (p.classes.includes(cls)) {
      merged++;
    } else {
      p.classes.push(cls);
    }
  }

  // 4. People entered in more than one class.
  const duplicates: Duplicate[] = [];
  for (const p of people.values()) {
    if (p.classes.length < 2 || p.classes.some((c) => c.startsWith('?'))) continue;
    const pick = choices.duplicates?.[p.key];
    const valid =
      pick !== undefined &&
      pick.length >= 1 &&
      pick.length <= 2 &&
      new Set(pick).size === pick.length &&
      pick.every((c) => p.classes.includes(c));
    duplicates.push({
      key: p.key,
      name: `${p.given} ${p.family}`.trim(),
      classes: [...p.classes],
      chosen: valid ? [...pick] : null,
    });
    if (valid) p.classes = [...pick];
  }

  // 5. People already in the event stay as they are.
  const known = new Set<string>();
  for (const e of existing) {
    for (const r of e.riders) {
      if (r.licence) known.add(`L:${norm(r.licence)}`);
      known.add(`N:${norm(r.givenName)}|${norm(r.familyName)}`);
    }
  }
  let alreadyEntered = 0;
  const toAdd: Person[] = [];
  for (const p of people.values()) {
    if (known.has(p.key) || known.has(`N:${norm(p.given)}|${norm(p.family)}`)) {
      alreadyEntered++;
    } else if (p.classes.every((c) => !c.startsWith('?'))) {
      // One class, or a duplicate the desk has decided (its classes are now the choice).
      if (p.classes.length === 1 || duplicates.some((d) => d.key === p.key && d.chosen)) {
        toAdd.push(p);
      }
    }
  }

  // 6. Numbers.
  const order = new Map(classesFromSetup(setup).map((c) => [c.name, c.order]));
  toAdd.sort(
    (a, b) =>
      (order.get(a.classes[0] ?? '') ?? 9000) - (order.get(b.classes[0] ?? '') ?? 9000) ||
      (a.classes[0] ?? '').localeCompare(b.classes[0] ?? '') ||
      a.family.localeCompare(b.family, 'en', { sensitivity: 'base' }) ||
      a.given.localeCompare(b.given, 'en', { sensitivity: 'base' }),
  );
  const notes: string[] = [];
  const taken = new Set(existing.map((e) => e.number));
  let numbering: ImportPlan['numbering'] = 'generated';
  if (preset.keep_numbers && toAdd.length > 0) {
    const nums = toAdd.map((p) => p.number);
    const ok =
      nums.every((n) => n !== undefined && !taken.has(n)) && new Set(nums).size === nums.length;
    if (ok) numbering = 'from_file';
    else
      notes.push(
        "The file's rider numbers are missing, repeated or already used, so tScore numbered the riders.",
      );
  }
  let next =
    existing.length > 0
      ? Math.max(...existing.map((e) => e.number)) + 1
      : (setup.event.first_rider_number ?? 1);
  const entries: EntryInput[] = toAdd.map((p) => {
    let number: number;
    if (numbering === 'from_file' && p.number !== undefined) number = p.number;
    else {
      while (taken.has(next)) next++;
      number = next++;
    }
    taken.add(number);
    const rider: PersonInput = {
      givenName: p.given,
      familyName: p.family,
      ...(p.licence ? { licence: p.licence } : {}),
    };
    return {
      number,
      riders: [rider],
      ...(p.club ? { club: p.club } : {}),
      ...(p.machine ? { machine: p.machine } : {}),
      competitionStatus: p.competitionStatus,
      status: 'riding',
      classes: p.classes,
    };
  });
  entries.sort((a, b) => a.number - b.number);

  const unknown = classes.filter((c) => c.by === 'unknown');
  const undecided = duplicates.filter((d) => d.chosen === null);
  return {
    source: list.source,
    rowsRead,
    skipped: [...skipped].map(([reason, count]) => ({ reason, count })),
    classes,
    merged,
    duplicates,
    alreadyEntered,
    entries,
    numbering,
    notes,
    newAliases,
    ready: unknown.length === 0 && undecided.length === 0 && entries.length > 0,
  };
}

function classResolver(setup: EventSetup, preset: ImportMapping) {
  const byName = new Map(setup.classes.map((c) => [norm(c.name), c.name]));
  const byAlias = new Map<string, string>();
  for (const c of setup.classes) for (const a of c.aliases ?? []) byAlias.set(norm(a), c.name);
  const presetAliases = new Map(
    Object.entries(preset.class_aliases ?? {}).map(([k, v]) => [norm(k), v]),
  );
  const exact = (name: string) => byName.get(norm(name));
  return {
    exact,
    resolve(raw: string): { name: string; by: MatchedBy } | undefined {
      const n = norm(raw);
      const direct = byName.get(n);
      if (direct) return { name: direct, by: 'name' };
      const alias = byAlias.get(n);
      if (alias) return { name: alias, by: 'event_alias' };
      const fromPreset = presetAliases
        .get(n)
        ?.map(exact)
        .find((x) => x !== undefined);
      if (fromPreset) return { name: fromPreset, by: 'preset' };
      const tidy = byName.get(norm(tidyClass(raw)));
      if (tidy) return { name: tidy, by: 'tidy' };
      return undefined;
    },
  };
}

/** "Trial 4+ (C+ Grade)" → "Trial 4 Plus". */
export function tidyClass(raw: string): string {
  return raw
    .replace(/\(.*?\)/g, '')
    .replace(/\b(\d)\s*\+/g, '$1 Plus')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Spaces tidied; a name typed all in capitals or all in lower case gets capitals. */
/**
 * The rider's machine from an entry-list row: the machine column, or make and model joined
 * ("Beta" + "Evo 300"), without repeating the make when the model already starts with it.
 */
export function machineOf(row: Pick<SourceRow, 'machine' | 'machine_make' | 'machine_model'>): {
  machine?: string;
} {
  const tidy = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  let machine = tidy(row.machine);
  if (!machine) {
    const make = tidy(row.machine_make);
    const model = tidy(row.machine_model);
    machine =
      make && model.toLowerCase().startsWith(make.toLowerCase())
        ? model
        : `${make} ${model}`.trim();
  }
  machine = machine.slice(0, MACHINE_MAX).trim();
  return machine ? { machine } : {};
}

export function tidyName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!/[a-z]/i.test(s) || (s !== s.toUpperCase() && s !== s.toLowerCase())) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** A licence number has a digit in it; "None", "N/A" and blanks don't count. */
function cleanLicence(raw: string | undefined): string | undefined {
  const s = raw?.trim().replace(/\s+/g, '');
  return s && /\d/.test(s) ? s : undefined;
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw || !/^\d{1,5}$/.test(raw.trim())) return undefined;
  const n = Number(raw.trim());
  return n >= 1 ? n : undefined;
}
