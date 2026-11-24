/**
 * Progress and "still on course" (architecture §9; decisions on the canvas, 22–24 Nov 2026).
 *
 * Worked out only from what the desk really captures: the cards in (with when each was handed
 * in), riders marked DNF or DNS, and the day's start time. No "back at the pits" button, no
 * reasons, no notes.
 *
 * - A rider is **on course** from the day's start until their last card of the day is in.
 * - They're **accounted for** when that card is in, or they're marked DNF or DNS.
 * - They're **overdue** when it's been longer than their class's average lap, plus a margin,
 *   since their last card (or the start). Two cards handed in together mean the rider is
 *   carrying laps, so the next card isn't due for two laps' time. Overdue never marks anyone
 *   DNF by itself.
 */
import type { EventSetup } from './generated/event-setup.js';
import type { EntryInput } from './results/model.js';

export const DEFAULT_OVERDUE_MARGIN_MINUTES = 30;

/** Cards handed in this close together count as handed in together. */
const TOGETHER_MS = 5 * 60_000;
const MINUTE = 60_000;

export interface CourseCard {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  /** When the desk received it, in ms since the epoch. */
  readonly at: number;
  /** The lap total, or null while any section is undecided. */
  readonly total: number | null;
}

export type CourseState = 'waiting' | 'out' | 'in' | 'dnf' | 'dns' | 'not_riding';

export type LapState =
  | { readonly kind: 'in'; readonly total: number | null; readonly at: number }
  | { readonly kind: 'due' }
  | { readonly kind: 'overdue' }
  | { readonly kind: 'dnf' }
  | { readonly kind: 'dns' }
  | { readonly kind: 'not_ridden' };

export interface RiderCourse {
  readonly number: number;
  readonly className: string;
  readonly state: CourseState;
  /** Laps the class rides this day. */
  readonly laps: number;
  /** Lap 1 to the most laps any class rides this day. */
  readonly lapStates: readonly LapState[];
  readonly lastCard?: { readonly lap: number; readonly at: number };
  /** Minutes since the last card (or the start), while on course. */
  readonly minutesOut?: number;
  readonly overdue?: {
    /** The lap whose card is late. */
    readonly lap: number;
    readonly minutes: number;
    /** The class's average lap, in minutes. */
    readonly averageLap: number;
  };
  /** The last hand-in brought more than one card (laps carried together). */
  readonly carrying?: number;
  readonly total: number;
}

export interface CourseReport {
  readonly day: number;
  /** The day's start (ms), if the setup has a date and start time. */
  readonly start?: number;
  readonly mostLaps: number;
  readonly riders: readonly RiderCourse[];
  /** Average lap per class, in minutes, where there's at least one lap to go by. */
  readonly averageLap: Readonly<Record<string, number>>;
  readonly counts: {
    readonly cardsIn: number;
    readonly cardsExpected: number;
    readonly out: number;
    /** Before the start, with no card in yet. */
    readonly waiting: number;
    readonly in: number;
    readonly overdue: number;
    readonly dnf: number;
    readonly dns: number;
  };
}

export interface CourseOptions {
  readonly day: number;
  readonly now: number;
  /** The day's start in ms; riders aren't on course before it. */
  readonly start?: number;
  readonly marginMinutes?: number;
}

const lapsFor = (setup: EventSetup, className: string, day: number) =>
  setup.classes.find((c) => c.name === className)?.days[String(day)]?.laps ?? 0;

/** Who's out, who's in, and who's overdue, on one day, at `now`. */
export function courseReport(
  setup: EventSetup,
  entries: readonly EntryInput[],
  cards: readonly CourseCard[],
  options: CourseOptions,
): CourseReport {
  const { day, now, start } = options;
  const margin = options.marginMinutes ?? DEFAULT_OVERDUE_MARGIN_MINUTES;
  const scored = (name: string) => setup.classes.find((c) => c.name === name)?.scored !== false;

  const byRider = new Map<number, CourseCard[]>();
  for (const c of cards) {
    if (c.day !== day) continue;
    const list = byRider.get(c.number) ?? [];
    list.push(c);
    byRider.set(c.number, list);
  }
  for (const list of byRider.values()) list.sort((a, b) => a.lap - b.lap);

  // Average lap per class: the time between a rider's hand-ins, shared out over the laps each
  // hand-in brought (lap 1 counts from the start, when there is one).
  const lapTimes = new Map<string, number[]>();
  for (const entry of entries) {
    const className = entry.classes[0] ?? '';
    const list = [...(byRider.get(entry.number) ?? [])].sort((a, b) => a.at - b.at);
    let from = start;
    let i = 0;
    while (i < list.length) {
      const batchStart = list[i]?.at ?? 0;
      let j = i;
      while (j + 1 < list.length && (list[j + 1]?.at ?? 0) - batchStart <= TOGETHER_MS) j++;
      const batch = j - i + 1;
      const at = list[j]?.at ?? batchStart;
      if (from !== undefined && at > from) {
        const each = (at - from) / batch;
        const times = lapTimes.get(className) ?? [];
        for (let k = 0; k < batch; k++) times.push(each);
        lapTimes.set(className, times);
      }
      from = at;
      i = j + 1;
    }
  }
  const averageLap: Record<string, number> = {};
  for (const [className, times] of lapTimes) {
    averageLap[className] = times.reduce((a, b) => a + b, 0) / times.length / MINUTE;
  }

  // Lap columns: the most laps any entered rider's class rides this day.
  const mostLaps = Math.max(
    0,
    ...entries
      .filter((e) => scored(e.classes[0] ?? ''))
      .map((e) => lapsFor(setup, e.classes[0] ?? '', day)),
  );

  const riders: RiderCourse[] = [];
  for (const entry of [...entries].sort((a, b) => a.number - b.number)) {
    const className = entry.classes[0] ?? '';
    if (!scored(className)) continue;
    const laps = lapsFor(setup, className, day);
    const list = byRider.get(entry.number) ?? [];
    const got = new Map(list.map((c) => [c.lap, c]));
    const last = [...list].sort((a, b) => a.at - b.at || a.lap - b.lap).at(-1);
    const total = list.reduce((a, c) => a + (c.total ?? 0), 0);

    let state: CourseState;
    if (laps === 0) state = 'not_riding';
    else if (entry.status === 'dns') state = 'dns';
    else if (got.has(laps)) state = 'in';
    else if (entry.status === 'dnf') state = 'dnf';
    else if (list.length > 0 || (start !== undefined && now >= start)) state = 'out';
    else state = 'waiting';

    // How many cards the last hand-in brought.
    const carrying = last
      ? list.filter((c) => Math.abs(c.at - last.at) <= TOGETHER_MS && c.at <= last.at).length
      : 0;
    const since = last?.at ?? start;
    const minutesOut = state === 'out' && since !== undefined ? (now - since) / MINUTE : undefined;
    const average = averageLap[className];
    const nextLap = Math.min(laps, Math.max(0, ...list.map((c) => c.lap)) + 1);
    const allowance = average === undefined ? undefined : average * Math.max(1, carrying) + margin;
    const overdue =
      state === 'out' && minutesOut !== undefined && allowance !== undefined
        ? minutesOut > allowance
        : false;

    const lapStates: LapState[] = [];
    for (let lap = 1; lap <= mostLaps; lap++) {
      const card = got.get(lap);
      if (lap > laps) lapStates.push({ kind: 'not_ridden' });
      else if (card) lapStates.push({ kind: 'in', total: card.total, at: card.at });
      else if (state === 'dns') lapStates.push({ kind: 'dns' });
      else if (state === 'dnf') lapStates.push({ kind: 'dnf' });
      else if (overdue && lap === nextLap) lapStates.push({ kind: 'overdue' });
      else lapStates.push({ kind: 'due' });
    }

    riders.push({
      number: entry.number,
      className,
      state,
      laps,
      lapStates,
      total,
      ...(last && { lastCard: { lap: last.lap, at: last.at } }),
      ...(minutesOut !== undefined && { minutesOut: Math.max(0, Math.floor(minutesOut)) }),
      ...(overdue &&
        average !== undefined &&
        minutesOut !== undefined && {
          overdue: { lap: nextLap, minutes: Math.floor(minutesOut), averageLap: average },
        }),
      ...(carrying > 1 && { carrying }),
    });
  }

  const counting = riders.filter((r) => r.state !== 'not_riding');
  const count = (s: CourseState) => counting.filter((r) => r.state === s).length;
  return {
    day,
    ...(start !== undefined && { start }),
    mostLaps,
    riders,
    averageLap,
    counts: {
      cardsIn: counting.reduce((a, r) => a + r.lapStates.filter((l) => l.kind === 'in').length, 0),
      cardsExpected: counting.filter((r) => r.state !== 'dns').reduce((a, r) => a + r.laps, 0),
      out: count('out'),
      waiting: count('waiting'),
      in: count('in'),
      overdue: counting.filter((r) => r.overdue).length,
      dnf: count('dnf'),
      dns: count('dns'),
    },
  };
}
