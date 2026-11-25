/**
 * The Event setup form edits a "draft": the setup in the shape the form needs (text boxes hold
 * strings, days are a list). `toSetup` turns it back into `tscore.event_setup/1`, keeping
 * everything the form doesn't show (event id, tie-breaks, labels, aliases …) from the original.
 */
import {
  DEFAULT_OVERDUE_MARGIN_MINUTES,
  isEventCode,
  isJuniorClassName,
  validateEventSetup,
  type EventSetup,
  type EventSetupTypes,
  type ValidationIssue,
} from '@tscore/core';
import i18next from '../i18n';

type Class = EventSetupTypes.Class;
type Session = 'full' | 'am' | 'pm';

export interface DraftClassDay {
  sections: string;
  laps: string;
  session: Session;
}

export interface DraftClass {
  /** Stable key for React while names are being edited. */
  key: string;
  name: string;
  /** Explicitly ticked or unticked; `undefined` follows the class name. */
  junior: boolean | undefined;
  /** One per event day. */
  days: DraftClassDay[];
  /** The class as loaded, so fields the form doesn't show are kept. */
  original?: Class;
}

export interface DraftSection {
  name: string;
  observer: string;
}

export interface DraftDay {
  date: string;
  startTime: string;
  /** Section names and observers, index 0 = section 1. Empty strings where nothing's entered. */
  sections: DraftSection[];
}

export interface DraftOfficial {
  /** Stable key for React while rows are being edited. */
  key: string;
  role: string;
  name: string;
}

export interface Draft {
  name: string;
  code: string;
  club: string;
  firstNumber: string;
  direction: 'low_wins' | 'high_wins';
  /** Minutes past the class's average lap before a rider is overdue. */
  overdueMargin: string;
  days: DraftDay[];
  classes: DraftClass[];
  officials: DraftOfficial[];
  /** Print the thank-you block on the results PDF. */
  thanks: boolean;
}

export const MAX_DAYS = 3;
const DEFAULT_START = '10:15';
let nextKey = 0;
const newKey = () => `c${++nextKey}`;

export function toDraft(setup: EventSetup): Draft {
  const days = setup.days.map((d) => {
    const sections: DraftSection[] = [];
    for (const s of d.section_details ?? []) {
      while (sections.length < s.section) sections.push({ name: '', observer: '' });
      sections[s.section - 1] = { name: s.name ?? '', observer: s.observer ?? '' };
    }
    return { date: d.date ?? '', startTime: d.start_time ?? DEFAULT_START, sections };
  });
  return {
    name: setup.event.name,
    code: setup.event.code,
    club: setup.event.club ?? '',
    firstNumber: String(setup.event.first_rider_number ?? 1),
    direction: setup.scoring?.direction ?? 'low_wins',
    overdueMargin: String(setup.overdue_margin_minutes ?? DEFAULT_OVERDUE_MARGIN_MINUTES),
    days,
    classes: setup.classes.map((c) => ({
      key: newKey(),
      name: c.name,
      junior: c.junior,
      days: days.map((_, i) => {
        const cd = c.days[String(i + 1)];
        return {
          sections: String(cd?.sections ?? 0),
          laps: String(cd?.laps ?? 0),
          session: cd?.session ?? 'full',
        };
      }),
      original: c,
    })),
    officials: (setup.officials ?? []).map((o) => ({ key: newKey(), role: o.role, name: o.name })),
    thanks: setup.thanks_on_results ?? true,
  };
}

export function newOfficial(): DraftOfficial {
  return { key: newKey(), role: '', name: '' };
}

/** How many sections a day has: the most any class rides that day. */
export function sectionsOnDay(draft: Draft, day: number): number {
  return Math.max(0, ...draft.classes.map((c) => whole(c.days[day]?.sections ?? '') || 0));
}

/** Is this class junior, as the tick box shows it? */
export function isJunior(c: DraftClass): boolean {
  return c.junior ?? isJuniorClassName(c.name);
}

export function newClass(dayCount: number): DraftClass {
  return {
    key: newKey(),
    name: '',
    junior: undefined,
    days: Array.from({ length: dayCount }, () => ({ sections: '10', laps: '4', session: 'full' })),
  };
}

/** Change the number of days, keeping what's entered for the days that stay. */
export function withDayCount(draft: Draft, count: number): Draft {
  const resize = <T>(list: T[], make: (i: number) => T) =>
    Array.from({ length: count }, (_, i) => list[i] ?? make(i));
  return {
    ...draft,
    days: resize(draft.days, (i) => ({
      date: nextDate(draft.days[i - 1]?.date ?? ''),
      startTime: draft.days[0]?.startTime ?? DEFAULT_START,
      sections: [],
    })),
    classes: draft.classes.map((c) => ({
      ...c,
      days: resize(c.days, () => ({
        ...(c.days[0] ?? { sections: '10', laps: '4', session: 'full' }),
      })),
    })),
  };
}

function nextDate(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t) ? '' : new Date(t + 86_400_000).toISOString().slice(0, 10);
}

/** A whole number from a text box, or NaN (so validation reports it). */
function whole(text: string): number {
  return /^\s*\d+\s*$/.test(text) ? Number(text) : Number.NaN;
}

export function toSetup(draft: Draft, base: EventSetup): EventSetup {
  const club = draft.club.trim();
  const event = {
    ...base.event,
    name: draft.name.trim(),
    code: draft.code.trim(),
    first_rider_number: whole(draft.firstNumber),
  };
  if (club) event.club = club;
  else delete event.club;

  const scoring: NonNullable<EventSetup['scoring']> = { ...base.scoring };
  if (draft.direction === 'high_wins') scoring.direction = 'high_wins';
  else delete scoring.direction;

  const margin = whole(draft.overdueMargin);
  const setup: EventSetup = {
    ...base,
    event,
    scoring,
    overdue_margin_minutes: margin,
    days: draft.days.map((d, i) => {
      const details = d.sections
        .map((s, k) => ({ section: k + 1, name: s.name.trim(), observer: s.observer.trim() }))
        .filter((s) => s.name || s.observer)
        .map((s) => ({
          section: s.section,
          ...(s.name && { name: s.name }),
          ...(s.observer && { observer: s.observer }),
        }));
      return {
        day: i + 1,
        ...(d.date && { date: d.date }),
        start_time: d.startTime,
        ...(details.length > 0 && { section_details: details }),
      };
    }),
    classes: draft.classes.map((c, i) => {
      const days: Class['days'] = {};
      c.days.forEach((d, j) => {
        days[String(j + 1)] = {
          sections: whole(d.sections),
          laps: whole(d.laps),
          ...(d.session !== 'full' && { session: d.session }),
        };
      });
      const ridesLaps = c.days.some((d) => whole(d.laps) > 0);
      const cls: Class = {
        ...c.original,
        name: c.name.trim(),
        order: c.original?.order ?? (i + 1) * 10,
        days,
      };
      // A class that rides no laps (minders) stays unscored; one given laps becomes scored.
      if (c.original?.scored === false && !ridesLaps) cls.scored = false;
      else delete cls.scored;
      if (c.junior === undefined) delete cls.junior;
      else cls.junior = c.junior;
      return cls;
    }),
  };
  if (Object.keys(scoring).length === 0) delete setup.scoring;
  const officials = draft.officials
    .map((o) => ({ role: o.role.trim(), name: o.name.trim() }))
    .filter((o) => o.role || o.name);
  if (officials.length) setup.officials = officials;
  else delete setup.officials;
  if (draft.thanks) delete setup.thanks_on_results;
  else setup.thanks_on_results = false;
  return setup;
}

/** One problem, said for the desk, and which field it belongs to. */
export interface Problem {
  /** e.g. `event.name`, `days[0].date`, `classes[2].days.1.sections`. */
  readonly field: string;
  readonly message: string;
}

/**
 * Everything wrong with the draft, in plain words. The form's own checks come first (they speak
 * the form's language); then whatever else the full setup validation finds.
 */
export function problems(draft: Draft, base: EventSetup): Problem[] {
  const out: Problem[] = [];
  const add = (field: string, message: string) => out.push({ field, message });
  const t = i18next.t;

  if (!draft.name.trim()) add('event.name', t('setupProblems.name'));
  if (!isEventCode(draft.code.trim())) add('event.code', t('setupProblems.code'));
  const first = whole(draft.firstNumber);
  if (!(first >= 1 && first <= 9999))
    add('event.first_rider_number', t('setupProblems.firstNumber'));
  const margin = whole(draft.overdueMargin);
  if (!(margin >= 5 && margin <= 240)) add('overdue_margin_minutes', t('setupProblems.overdue'));
  draft.days.forEach((d, i) => {
    if (!d.date)
      add(
        `days[${i}].date`,
        draft.days.length > 1
          ? t('setupProblems.dayDate', { day: i + 1 })
          : t('setupProblems.date'),
      );
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.startTime))
      add(`days[${i}].start_time`, t('setupProblems.start'));
  });
  if (draft.classes.length === 0) add('classes', t('setupProblems.noClasses'));
  const seen = new Set<string>();
  draft.classes.forEach((c, i) => {
    const name = c.name.trim();
    const label = name || t('setupProblems.classN', { n: i + 1 });
    if (!name) add(`classes[${i}].name`, t('setupProblems.className', { label }));
    else if (seen.has(name.toLowerCase()))
      add(`classes[${i}].name`, t('setupProblems.twice', { name }));
    seen.add(name.toLowerCase());
    c.days.forEach((d, j) => {
      const day = draft.days.length > 1 ? t('setupProblems.onDay', { day: j + 1 }) : '';
      const laps = whole(d.laps);
      const sections = whole(d.sections);
      if (!(laps >= 0 && laps <= 10))
        add(`classes[${i}].days.${j + 1}.laps`, t('setupProblems.laps', { label, day }));
      else if (laps > 0 && !(sections >= 1))
        add(
          `classes[${i}].days.${j + 1}.sections`,
          t('setupProblems.noSections', { label, laps, day }),
        );
      else if (laps > 0 && sections > 16)
        add(
          `classes[${i}].days.${j + 1}.sections`,
          t('setupProblems.tooMany', { label, sections, day }),
        );
    });
  });
  draft.officials.forEach((o, i) => {
    const role = o.role.trim();
    const name = o.name.trim();
    if (name && !role) add(`officials[${i}].role`, t('setupProblems.role', { name }));
    if (role && !name) add(`officials[${i}].name`, t('setupProblems.officialName', { role }));
  });
  if (out.length) return out;

  // Anything else (rare: rules the form doesn't check itself).
  const r = validateEventSetup(toSetup(draft, base));
  return r.ok
    ? []
    : r.issues.map((i: ValidationIssue) => ({ field: i.path, message: sentence(i.message) }));
}

function sentence(s: string): string {
  const t = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Labels the event needs for this class: riders × laps over all days. */
export function labelsFor(c: DraftClass, riders: number): number {
  return riders * c.days.reduce((n, d) => n + (whole(d.laps) || 0), 0);
}
