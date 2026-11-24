/**
 * The results engine's input: everything needed to work out results, and nothing else.
 *
 * It is deliberately independent of the database and the UI. The event store builds one of
 * these from the current (latest-version) scores; tests build them by hand. The engine is a
 * pure function from this input to a `tscore.results/1` payload.
 */
import type { Penalty } from '../generated/results.js';

export type CompetitionStatus = 'competitive' | 'no_award' | 'non_competitive';
export type Direction = 'low_wins' | 'high_wins';

/** Tie-break keys, applied in order: `total`, `most_N`, `fewest_N`, `ride_off`. */
export type TieBreak = string;

export interface ScoringRules {
  readonly scoreValues: readonly number[];
  readonly direction: Direction;
  readonly tieBreaks: readonly TieBreak[];
}

export const DEFAULT_SCORING: ScoringRules = {
  scoreValues: [0, 1, 2, 3, 5],
  direction: 'low_wins',
  tieBreaks: ['total', 'most_0', 'most_1', 'most_2', 'most_3', 'fewest_5', 'ride_off'],
};

export interface ClassDayInput {
  readonly day: number;
  readonly sections: number;
  readonly laps: number;
  /** Sections not scored for this class on this day, from a given lap onwards. */
  readonly skipped?: readonly { readonly section: number; readonly fromLap: number }[];
}

export interface ClassInput {
  readonly name: string;
  /** Display and numbering order (lower first). */
  readonly order: number;
  /** false for classes that are entered but never scored, such as minders. */
  readonly scored: boolean;
  /** Only days this class rides (laps > 0). */
  readonly days: readonly ClassDayInput[];
}

/** The longest name (each of given and family name), club and machine the desk can type. */
export const NAME_MAX = 60;
export const CLUB_MAX = 80;
export const MACHINE_MAX = 60;

export interface PersonInput {
  readonly givenName: string;
  readonly familyName: string;
  /** Licence or member number, from the entry list. Matches riders on re-import; never published. */
  readonly licence?: string;
}

export type EntryStatus = 'riding' | 'dnf' | 'dns';

export interface PenaltyInput extends Penalty {
  /** Classes the penalty applies to (second-class riders). Omit for all of the rider's classes. */
  readonly classes?: readonly string[];
}

export interface EntryInput {
  /** Rider number. Unique in the event; a second-class rider keeps one number. */
  readonly number: number;
  /** One rider, or driver then passenger for a sidecar. */
  readonly riders: readonly PersonInput[];
  readonly club?: string;
  /** Make and model, e.g. "Beta Evo 300". For the desk only: never in published results. */
  readonly machine?: string;
  readonly competitionStatus: CompetitionStatus;
  readonly status: EntryStatus;
  /** One class, or two for a rider whose scores count in a second class. */
  readonly classes: readonly string[];
  readonly penalties?: readonly PenaltyInput[];
  /** Ride-off position per class, when a ride-off decided a tie. */
  readonly rideOff?: Readonly<Record<string, number>>;
}

export interface CardInput {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  /**
   * One score per section, from section 1. `null` means not yet decided (e.g. waiting in the
   * review queue). Scores for skipped sections or beyond the class's section count are ignored.
   */
  readonly scores: readonly (number | null)[];
}

export interface EventInput {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly club?: string;
  readonly venue?: string;
  readonly permit?: string;
  readonly days: readonly { readonly day: number; readonly date: string }[];
  readonly scoring: ScoringRules;
  readonly classes: readonly ClassInput[];
  readonly entries: readonly EntryInput[];
  /** The current version of every card received. One per rider, day and lap. */
  readonly cards: readonly CardInput[];
}

export interface PrivacyRules {
  /**
   * Junior classes, whose riders' family names are published as an initial ("Riley M.").
   * Applied when the payload is built, so every output gets the same filtered names.
   */
  readonly juniorSurnameInitialClasses?: readonly string[];
}

export interface ResultsOptions {
  readonly generator: { readonly name: string; readonly version: string };
  /** When the payload is built, with UTC offset. */
  readonly generatedAt: string;
  /** Asking for `final` when anything is missing or undecided throws {@link ResultsNotFinalError}. */
  readonly status: 'provisional' | 'final';
  readonly revision: number;
  readonly privacy?: PrivacyRules;
}
