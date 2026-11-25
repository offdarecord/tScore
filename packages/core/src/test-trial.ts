/**
 * The Test trial kit (#81): an invented event to rehearse the whole day at home, and its answer
 * key. The kit's entry list, printable practice cards and answer key are built from this by
 * `scripts/build-test-trial.mjs`; the app checks a rehearsal against the key.
 *
 * Invented riders and clubs only: no real person, club or card.
 */

export const TEST_TRIAL_KEY_FORMAT = 'tscore.test_trial_key/1';

/** The event to create for the rehearsal. */
export const TEST_TRIAL_EVENT = {
  name: 'TEST TRIAL Practice Event',
  code: 'TEST',
  sections: 6,
  laps: 2,
} as const;

export interface TestTrialRider {
  readonly givenName: string;
  readonly familyName: string;
  readonly className: string;
  readonly club: string;
}

/** Twelve invented riders in three classes. */
export const TEST_TRIAL_RIDERS: readonly TestTrialRider[] = [
  { givenName: 'Avery', familyName: 'Practice', className: 'Trial 2', club: 'Test Trials Club' },
  { givenName: 'Blake', familyName: 'Rehearsal', className: 'Trial 2', club: 'Test Trials Club' },
  { givenName: 'Casey', familyName: 'Sample', className: 'Trial 2', club: 'Example MCC' },
  { givenName: 'Drew', familyName: 'Example', className: 'Trial 2', club: 'Example MCC' },
  { givenName: 'Emery', familyName: 'Trialrun', className: 'Trial 3', club: 'Test Trials Club' },
  { givenName: 'Finley', familyName: 'Dummy', className: 'Trial 3', club: 'Example MCC' },
  { givenName: 'Gray', familyName: 'Mockup', className: 'Trial 3', club: 'Test Trials Club' },
  { givenName: 'Harper', familyName: 'Drill', className: 'Trial 3', club: 'Example MCC' },
  { givenName: 'Indy', familyName: 'Warmup', className: 'Trial 4', club: 'Test Trials Club' },
  { givenName: 'Jordan', familyName: 'Dryrun', className: 'Trial 4', club: 'Example MCC' },
  { givenName: 'Kai', familyName: 'Testcase', className: 'Trial 4', club: 'Test Trials Club' },
  { givenName: 'Logan', familyName: 'Pilot', className: 'Trial 4', club: 'Example MCC' },
];

export interface TestTrialCard {
  /** The card's number in the kit (1 = first card printed). */
  readonly card: number;
  readonly givenName: string;
  readonly familyName: string;
  readonly day: number;
  readonly lap: number;
  /** The score to punch for each section, section 1 first. */
  readonly scores: readonly number[];
}

export interface TestTrialKey {
  readonly format: typeof TEST_TRIAL_KEY_FORMAT;
  readonly event: { readonly name: string; readonly code: string };
  readonly cards: readonly TestTrialCard[];
}

const VALUES = [0, 1, 2, 3, 5] as const;

/**
 * The answer key: every rider, every lap, with a spread of scores so each value appears in
 * every section across the kit. Repeatable: the same key for every build.
 */
export function testTrialKey(): TestTrialKey {
  const cards: TestTrialCard[] = [];
  let n = 0;
  for (let lap = 1; lap <= TEST_TRIAL_EVENT.laps; lap++) {
    TEST_TRIAL_RIDERS.forEach((r, i) => {
      n++;
      const scores = Array.from(
        { length: TEST_TRIAL_EVENT.sections },
        (_, s) => VALUES[(i * 3 + s * 2 + lap * 7 + ((i * s) % 3)) % VALUES.length] ?? 0,
      );
      cards.push({
        card: n,
        givenName: r.givenName,
        familyName: r.familyName,
        day: 1,
        lap,
        scores,
      });
    });
  }
  return {
    format: TEST_TRIAL_KEY_FORMAT,
    event: { name: TEST_TRIAL_EVENT.name, code: TEST_TRIAL_EVENT.code },
    cards,
  };
}

/** True if this looks like a Test trial answer key. */
export function isTestTrialKey(x: unknown): x is TestTrialKey {
  if (typeof x !== 'object' || x === null) return false;
  const k = x as Record<string, unknown>;
  return (
    k['format'] === TEST_TRIAL_KEY_FORMAT &&
    Array.isArray(k['cards']) &&
    k['cards'].every(
      (c: unknown) =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as TestTrialCard).givenName === 'string' &&
        typeof (c as TestTrialCard).familyName === 'string' &&
        Number.isInteger((c as TestTrialCard).lap) &&
        Number.isInteger((c as TestTrialCard).day) &&
        Array.isArray((c as TestTrialCard).scores),
    )
  );
}

/** A rider as the event has them, and a card as it was recorded. */
export interface CheckRider {
  readonly number: number;
  readonly givenName: string;
  readonly familyName: string;
}
export interface CheckCard {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  readonly scores: readonly (number | null)[];
}

export interface WrongCell {
  readonly section: number;
  readonly expected: number;
  /** What was recorded: null = undecided (still in the review queue). */
  readonly read: number | null;
}

export interface CardCheck {
  readonly card: number;
  readonly name: string;
  readonly number?: number;
  readonly lap: number;
  readonly outcome: 'right' | 'wrong' | 'missing' | 'no_rider';
  readonly wrong: readonly WrongCell[];
}

export interface TestTrialCheck {
  readonly cards: number;
  readonly right: number;
  readonly results: readonly CardCheck[];
  /** Plain hints at what to look at, from the pattern of mistakes. */
  readonly hints: readonly string[];
}

const nameKey = (given: string, family: string) =>
  `${given.trim()} ${family.trim()}`.toLowerCase().replace(/\s+/g, ' ');

/** Compare what the event recorded with the answer key. */
export function checkTestTrial(
  key: TestTrialKey,
  riders: readonly CheckRider[],
  cards: readonly CheckCard[],
): TestTrialCheck {
  const byName = new Map(riders.map((r) => [nameKey(r.givenName, r.familyName), r]));
  const results: CardCheck[] = key.cards.map((k) => {
    const name = `${k.givenName} ${k.familyName}`;
    const rider = byName.get(nameKey(k.givenName, k.familyName));
    if (!rider) return { card: k.card, name, lap: k.lap, outcome: 'no_rider', wrong: [] };
    const got = cards.find((c) => c.number === rider.number && c.day === k.day && c.lap === k.lap);
    const base = { card: k.card, name, number: rider.number, lap: k.lap };
    if (!got) return { ...base, outcome: 'missing', wrong: [] };
    const wrong: WrongCell[] = [];
    k.scores.forEach((expected, i) => {
      const read = got.scores[i];
      if (read !== expected) wrong.push({ section: i + 1, expected, read: read ?? null });
    });
    return { ...base, outcome: wrong.length ? 'wrong' : 'right', wrong };
  });

  const hints: string[] = [];
  const wrongCells = results.flatMap((r) => r.wrong);
  if (results.some((r) => r.outcome === 'no_rider')) {
    hints.push(
      "Some riders in the key aren't in this event: import the kit's entry list before checking.",
    );
  }
  if (results.some((r) => r.outcome === 'missing')) {
    hints.push('Some cards are missing: scan them, or check the review queue.');
  }
  if (wrongCells.some((c) => c.read === null)) {
    hints.push('Some scores are still undecided: finish the review queue, then check again.');
  }
  const decided = wrongCells.filter((c) => c.read !== null);
  if (decided.length) {
    const sections = new Map<number, number>();
    for (const c of decided) sections.set(c.section, (sections.get(c.section) ?? 0) + 1);
    const [topSection, topCount] = [...sections.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    if (topCount >= 3 && topCount >= decided.length / 2) {
      hints.push(
        `Most wrong scores are in section ${topSection}: the card may be cut off at the edge of the picture. Centre the card under the camera, or raise the camera.`,
      );
    }
    hints.push(
      'For wrong scores, look for glare on the card (move or dim the light), a blurry picture (let the focus settle), or a hole not punched cleanly. Check the card itself too: the punch may be in the wrong place.',
    );
  }
  return {
    cards: results.length,
    right: results.filter((r) => r.outcome === 'right').length,
    results,
    hints,
  };
}

/**
 * The printed practice card, in millimetres, from the regional card's geometry in column widths
 * (see the vision package's REGIONAL_16): 43 mm wide, so one column width is 43 / 4.4 mm.
 */
export const PRACTICE_CARD_MM = {
  width: 43,
  height: 145,
  /** One column width. */
  unit: 43 / 4.4,
  /** The column's centre line, from the card's left edge (it spans −1.95 to 2.45 units). */
  columnX: 1.95 * (43 / 4.4),
  /** The bottom of the grid (bottom of section 16), from the card's bottom edge. */
  gridBottom: 10,
} as const;
