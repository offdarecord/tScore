import type {
  ClassResults,
  Entry,
  EntryDay,
  Lap,
  Penalty,
  Person,
  Results,
} from '../generated/results.js';
import type {
  CardInput,
  ClassDayInput,
  ClassInput,
  EntryInput,
  EventInput,
  PersonInput,
  ResultsOptions,
  Tier,
} from './model.js';
import { makeComparator, rank, type RankKey } from './ranking.js';

/** Something that stops results being final: a card not in yet, or a score not decided. */
export interface ResultsGap {
  readonly kind: 'missing_card' | 'undecided_score';
  readonly number: number;
  readonly className: string;
  readonly day: number;
  readonly lap: number;
  /** For `undecided_score`: the section, from 1. */
  readonly section?: number;
}

export class ResultsNotFinalError extends Error {
  constructor(readonly gaps: readonly ResultsGap[]) {
    super(
      `Results can't be final yet: ${gaps.length} card(s) or score(s) still missing or undecided.`,
    );
    this.name = 'ResultsNotFinalError';
  }
}

export interface ResultsReport {
  readonly results: Results;
  /** Empty when results could be marked final. */
  readonly gaps: readonly ResultsGap[];
}

/** One entry's scores as counted in one class. */
interface Scored {
  readonly entry: EntryInput;
  readonly days: EntryDay[];
  readonly penalties: Penalty[];
  readonly total: number;
  readonly counts: Map<number, number>;
  readonly key: RankKey;
  /** Every card in and every score decided, for every lap this class rides. */
  readonly complete: boolean;
}

const cardKey = (number: number, day: number, lap: number) => `${number}:${day}:${lap}`;

/**
 * Work out an event's results as a `tscore.results/1` payload.
 *
 * Pure and deterministic: the same input and options always give the same payload. Throws
 * `RangeError` for input that can't be right (unknown class, duplicate card, invalid score) and
 * {@link ResultsNotFinalError} when `final` is asked for while cards are missing or undecided.
 */
export function computeResults(input: EventInput, options: ResultsOptions): ResultsReport {
  checkInput(input);
  const compare = makeComparator(input.scoring.tieBreaks, input.scoring.direction);
  // DNF riders didn't ride every lap, so their totals aren't comparable: they're ordered by the
  // remaining tie-breaks (most cleans first), as club scoring has always done.
  const compareDnf = makeComparator(
    input.scoring.tieBreaks.filter((t) => t !== 'total'),
    input.scoring.direction,
  );
  const scoreValues = new Set(input.scoring.scoreValues);
  const juniors = new Set(options.privacy?.juniorSurnameInitialClasses ?? []);
  const cards = new Map<string, CardInput>();
  for (const c of input.cards) cards.set(cardKey(c.number, c.day, c.lap), c);

  const gaps: ResultsGap[] = [];
  const classes = [...input.classes]
    .filter((c) => c.scored)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((cls) => classResults(cls));

  if (options.status === 'final' && gaps.length > 0) throw new ResultsNotFinalError(gaps);

  const results: Results = {
    schema: 'tscore.results/1',
    generator: { name: options.generator.name, version: options.generator.version },
    generated_at: options.generatedAt,
    status: options.status,
    revision: options.revision,
    event: {
      id: input.id,
      code: input.code,
      name: input.name,
      ...(input.club !== undefined && { club: input.club }),
      ...(input.venue !== undefined && { venue: input.venue }),
      ...(input.permit !== undefined && { permit: input.permit }),
      days: input.days.map((d) => ({ day: d.day, date: d.date })),
      scoring: {
        score_values: [...input.scoring.scoreValues],
        direction: input.scoring.direction,
        tie_breaks: [...input.scoring.tieBreaks],
      },
    },
    classes,
  };
  if (juniors.size > 0) results.privacy_applied = ['junior_surname_initial'];
  return { results, gaps };

  function classResults(cls: ClassInput): ClassResults {
    const days = [...cls.days].sort((a, b) => a.day - b.day);
    const members = input.entries.filter((e) => e.classes.includes(cls.name));
    const scored = members.filter((e) => e.status !== 'dns').map((e) => scoreEntry(e, cls, days));

    const byNumber = (a: Scored, b: Scored) => a.entry.number - b.entry.number;
    const tiers = ['competitive', 'no_award', 'non_competitive'] as const;
    const inTier = (tier: Tier, f: (s: Scored) => boolean) =>
      scored.filter((s) => s.entry.tier === tier && f(s));

    // Display order, matching club results (checked against past events' scoring workbooks).
    // For each tier in turn (competitive, No award, Non-competitive):
    //   1. riders still in with every card in, ranked by the full tie-breaks;
    //   2. riders still in with a card missing or a score undecided (provisional results only),
    //      ranked the same way on what's in so far;
    //   3. DNF riders, ranked by the tie-breaks without the total (most cleans first), since
    //      they didn't ride every lap.
    // Then DNS riders, by number.
    const out: Entry[] = [];
    for (const tier of tiers) {
      let placed = 0;
      for (const complete of [true, false]) {
        const group = inTier(tier, (s) => s.entry.status === 'riding' && s.complete === complete);
        const ranked = rank(group, (s) => s.key, compare, byNumber);
        for (const p of ranked) {
          const place = placed + p.place;
          out.push(
            entryOut(p.item, cls, {
              position: tier === 'competitive' ? place : null,
              rankInTier: tier === 'competitive' ? null : place,
              tied: p.tiedWithPrevious,
            }),
          );
        }
        placed += ranked.length;
      }
      const dnf = inTier(tier, (s) => s.entry.status === 'dnf');
      for (const p of rank(dnf, (s) => s.key, compareDnf, byNumber)) {
        out.push(entryOut(p.item, cls, { position: null, rankInTier: null, tied: false }));
      }
    }
    members
      .filter((e) => e.status === 'dns')
      .sort((a, b) => a.number - b.number)
      .forEach((e) => out.push(dnsOut(e, cls)));

    return {
      name: cls.name,
      days: days.map((d) => ({
        day: d.day,
        sections: d.sections,
        laps: d.laps,
        ...(d.skipped && d.skipped.length > 0
          ? { skipped: d.skipped.map((s) => ({ section: s.section, from_lap: s.fromLap })) }
          : {}),
      })),
      entries: out,
    };
  }

  function scoreEntry(entry: EntryInput, cls: ClassInput, days: ClassDayInput[]): Scored {
    const counts = new Map<number, number>();
    const gapsBefore = gaps.length;
    const entryDays: EntryDay[] = days.map((d) => {
      const laps: Lap[] = [];
      for (let lap = 1; lap <= d.laps; lap++) {
        const card = cards.get(cardKey(entry.number, d.day, lap));
        if (!card) {
          laps.push({ lap, total: null, sections: null });
          if (entry.status === 'riding') {
            gaps.push({
              kind: 'missing_card',
              number: entry.number,
              className: cls.name,
              day: d.day,
              lap,
            });
          }
          continue;
        }
        const sections: (number | null)[] = [];
        for (let s = 1; s <= d.sections; s++) {
          const skipped = d.skipped?.some((k) => k.section === s && k.fromLap <= lap) ?? false;
          const v = card.scores[s - 1];
          if (skipped) {
            sections.push(null);
          } else if (v === null || v === undefined) {
            sections.push(null);
            gaps.push({
              kind: 'undecided_score',
              number: entry.number,
              className: cls.name,
              day: d.day,
              lap,
              section: s,
            });
          } else {
            if (!scoreValues.has(v)) {
              throw new RangeError(
                `Rider ${entry.number}, day ${d.day} lap ${lap} section ${s}: ${v} is not a valid score`,
              );
            }
            sections.push(v);
            counts.set(v, (counts.get(v) ?? 0) + 1);
          }
        }
        laps.push({ lap, total: sum(sections), sections });
      }
      return { day: d.day, total: sum(laps.map((l) => l.total)), laps };
    });

    const penalties: Penalty[] = (entry.penalties ?? [])
      .filter((p) => p.classes === undefined || p.classes.includes(cls.name))
      .map((p) => ({
        points: p.points,
        reason: p.reason,
        ...(p.note !== undefined && { note: p.note }),
        ...(p.day !== undefined && { day: p.day }),
        ...(p.lap !== undefined && { lap: p.lap }),
      }));
    const total = sum(entryDays.map((d) => d.total)) + sum(penalties.map((p) => p.points));
    return {
      entry,
      days: entryDays,
      penalties,
      total,
      counts,
      key: { total, counts, rideOff: entry.rideOff?.[cls.name] },
      complete: gaps.length === gapsBefore,
    };
  }

  function base(
    e: EntryInput,
    cls: ClassInput,
  ): Pick<Entry, 'number' | 'riders' | 'club' | 'tier'> {
    return {
      number: e.number,
      riders: e.riders.map((p) => person(p, juniors.has(cls.name))),
      ...(e.club !== undefined && { club: e.club }),
      tier: e.tier,
    };
  }

  function entryOut(
    s: Scored,
    cls: ClassInput,
    place: { position: number | null; rankInTier: number | null; tied: boolean },
  ): Entry {
    const e = s.entry;
    const rideOff = e.rideOff?.[cls.name];
    const others = e.classes.filter((c) => c !== cls.name);
    return {
      ...base(e, cls),
      status: e.status === 'dnf' ? 'dnf' : 'finished',
      position: place.position,
      rank_in_tier: place.rankInTier,
      ...(place.tied && { tied_with_previous: true }),
      total: s.total,
      counts: Object.fromEntries(
        input.scoring.scoreValues.map((v) => [String(v), s.counts.get(v) ?? 0]),
      ),
      days: s.days,
      penalties: s.penalties,
      ...(rideOff !== undefined && { ride_off: rideOff }),
      ...(others.length > 0 && { also_in: others }),
    };
  }

  function dnsOut(e: EntryInput, cls: ClassInput): Entry {
    return { ...base(e, cls), status: 'dns', position: null, rank_in_tier: null, total: null };
  }
}

function person(p: PersonInput, initialOnly: boolean): Person {
  const family = initialOnly ? `${p.familyName.trim().charAt(0).toUpperCase()}.` : p.familyName;
  return { name: `${p.givenName} ${family}`.trim(), given_name: p.givenName, family_name: family };
}

function sum(xs: readonly (number | null)[]): number {
  return xs.reduce<number>((a, b) => a + (b ?? 0), 0);
}

function checkInput(input: EventInput): void {
  const names = new Set<string>();
  for (const c of input.classes) {
    if (names.has(c.name)) throw new RangeError(`Class "${c.name}" is listed twice`);
    names.add(c.name);
  }
  const numbers = new Set<number>();
  for (const e of input.entries) {
    if (numbers.has(e.number)) throw new RangeError(`Rider number ${e.number} is used twice`);
    numbers.add(e.number);
    if (e.classes.length < 1 || e.classes.length > 2) {
      throw new RangeError(`Rider ${e.number} must be in one or two classes`);
    }
    for (const c of e.classes) {
      if (!names.has(c)) throw new RangeError(`Rider ${e.number}: unknown class "${c}"`);
    }
  }
  const seen = new Set<string>();
  for (const c of input.cards) {
    const k = cardKey(c.number, c.day, c.lap);
    if (seen.has(k)) {
      throw new RangeError(`Two cards for rider ${c.number}, day ${c.day}, lap ${c.lap}`);
    }
    seen.add(k);
    if (!numbers.has(c.number)) throw new RangeError(`Card for unknown rider ${c.number}`);
  }
}
