/**
 * Teach a card (#107): the reading side of the wizard that lets a club describe its own
 * scorecard. Deterministic and explainable, not machine learning:
 *
 * 1. A blank card is photographed and its four corners marked. tScore straightens it into a
 *    picture of the card in millimetres ({@link straightenCard}), finds the black section column
 *    if there is one ({@link findColumnOnBlank}), and keeps the straightened picture as the
 *    profile's blank card. Every cell is read as change from it ({@link blankReferenceFromStraight}).
 * 2. The club describes the card in millimetres ({@link TeachLayout}), which becomes a card
 *    profile ({@link taughtProfile}).
 * 3. A few marked cards are read, the club says what each row really holds, and tScore proposes
 *    the thresholds that read them best ({@link proposeThresholds}), then shows how they read.
 *
 * A taught profile is always `assisted`: a person confirms every card it reads.
 */
import {
  cardProfile,
  MARKING_STYLE_THRESHOLDS,
  type CardProfile,
  type CardThresholds,
  type MarkingStyle,
} from '@tscore/core';
import { blankReferenceFrom, type BlankReference } from './blank-reference.js';
import {
  CORNER_ORDER,
  homography,
  project,
  readCardFromCorners,
  syntheticCorners,
  type CardCorners,
} from './corners.js';
import { sample, toGrey, type GreyImage, type RgbaImage } from './image.js';
import {
  decideRow,
  readCard,
  readerProfile,
  REGIONAL_16,
  type CardPose,
  type Point,
  type ReaderProfile,
  type ReadResult,
  type RowReading,
} from './reader.js';
import { syntheticCard, type SyntheticCard } from './synthetic.js';

/** The straightened blank card's resolution: pixels per millimetre. */
export const TEACH_PX_PER_MM = 5;

/** At least this many marked cards before tScore proposes thresholds; 5 to 10 is better. */
export const TEACH_MIN_CARDS = 3;
export const TEACH_MAX_CARDS = 10;

/** The card's size, held upright. */
export interface CardSize {
  readonly width_mm: number;
  readonly height_mm: number;
}

/** The maps between the card's millimetres (x right, y up from bottom-left) and the picture. */
function cardMaps(corners: CardCorners, card: CardSize) {
  const { width_mm: W, height_mm: H } = card;
  const mm = [
    { x: 0, y: H },
    { x: W, y: H },
    { x: W, y: 0 },
    { x: 0, y: 0 },
  ];
  const px = CORNER_ORDER.map((n) => corners[n]);
  const toPicture = homography(mm, px);
  const toCard = homography(px, mm);
  return toPicture && toCard ? { toPicture, toCard } : null;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/**
 * The card straightened from its corners: a grey picture of the card at {@link TEACH_PX_PER_MM},
 * header at the top, normalised so 0 is the black mat around the card and 255 its paper. Being
 * relative to the paper and the mat, it suits any lighting. Null when the corners can't be the
 * card or the card can't be told from the mat.
 */
export function straightenCard(
  frame: RgbaImage,
  corners: CardCorners,
  card: CardSize,
): GreyImage | null {
  const maps = cardMaps(corners, card);
  if (!maps) return null;
  const grey = toGrey(frame, 'luma');
  const { width_mm: W, height_mm: H } = card;
  const atMm = (x: number, y: number) => {
    const p = project(maps.toPicture, { x, y });
    return sample(grey, p.x, p.y);
  };
  // The same levels the reader uses when reading from corners: the mat just outside the card,
  // and the card's lighter part.
  const out = Math.max(W, H) * 0.03;
  const mats: number[] = [];
  for (let k = 1; k < 8; k++) {
    const f = k / 8;
    mats.push(atMm(-out, f * H), atMm(W + out, f * H), atMm(f * W, -out), atMm(f * W, H + out));
  }
  const inside: number[] = [];
  for (let i = 1; i < 12; i++) {
    for (let j = 1; j < 30; j++) inside.push(atMm((i / 12) * W, (j / 30) * H));
  }
  inside.sort((a, b) => a - b);
  const black = median(mats);
  const paper = inside[Math.floor(inside.length * 0.8)] ?? 0;
  if (paper - black < 40) return null;
  const width = Math.max(1, Math.round(W * TEACH_PX_PER_MM));
  const height = Math.max(1, Math.round(H * TEACH_PX_PER_MM));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const g = atMm((x + 0.5) / TEACH_PX_PER_MM, H - (y + 0.5) / TEACH_PX_PER_MM);
      data[y * width + x] = Math.round(
        Math.min(1, Math.max(0, (g - black) / (paper - black))) * 255,
      );
    }
  }
  return { width, height, data };
}

/** Where a card's grid sits, in millimetres from its bottom-left corner. */
export interface TeachGrid {
  /** The grid's reference line across the card: the black column's centre, or the left edge. */
  readonly origin_x_mm: number;
  /** The bottom of the last row. */
  readonly origin_y_mm: number;
  /** One grid unit: the black column's width (or 10 mm for a card without one). */
  readonly unit_mm: number;
  /** Each row's height. */
  readonly row_mm: number;
}

/** A card without a black column measures in plain 10 mm units from its left edge. */
const CORNERS_UNIT_MM = 10;

/** The row heights tried when looking for a black column (in column widths, ±15% each). */
const PITCHES = [0.45, 0.55, 0.675, 0.82, 1, 1.2];

/**
 * Look for a black section column on the blank card, as the black-column locator would read
 * it. Null when there isn't one (or it doesn't span `rows` rows and a header row): then the card
 * is read from its corners.
 */
export function findColumnOnBlank(frame: RgbaImage, rows: number): CardPose | null {
  for (const pitch of PITCHES) {
    const reader: ReaderProfile = { ...REGIONAL_16, id: 'teach', rows, pitch };
    const r = readCard(frame, reader);
    if (r.ok) return r.card.pose;
  }
  return null;
}

/** Where the black column found on the blank card puts the grid, in the card's millimetres. */
export function gridFromColumn(
  pose: CardPose,
  corners: CardCorners,
  card: CardSize,
): TeachGrid | null {
  const maps = cardMaps(corners, card);
  if (!maps) return null;
  const at = (p: Point) => project(maps.toCard, p);
  const origin = at(pose.bottom);
  const across = at({
    x: pose.bottom.x + pose.right.x * pose.width,
    y: pose.bottom.y + pose.right.y * pose.width,
  });
  const unit = Math.hypot(across.x - origin.x, across.y - origin.y);
  if (!(unit > 0)) return null;
  return {
    origin_x_mm: round(origin.x, 2),
    origin_y_mm: round(origin.y, 2),
    unit_mm: round(unit, 3),
    row_mm: round(pose.pitch * unit, 2),
  };
}

/** A starting grid for a card without a black column: the regional card's proportions. */
export function startingGrid(card: CardSize, rows: number): TeachGrid {
  const row = round(Math.min(card.height_mm * 0.8, card.height_mm - 20) / (rows + 1), 2);
  return {
    origin_x_mm: 0,
    origin_y_mm: round(Math.min(15, card.height_mm * 0.1), 2),
    unit_mm: CORNERS_UNIT_MM,
    row_mm: Math.max(1, row),
  };
}

/** One value column, in millimetres from the card's left edge. */
export interface TeachColumn {
  readonly score: number;
  readonly x_mm: number;
}

/** The card as the club describes it, in millimetres: what the wizard's steps fill in. */
export interface TeachLayout {
  readonly id: string;
  readonly name: string;
  readonly card: CardSize;
  readonly rows: number;
  readonly locator: 'black-column' | 'manual-corners';
  readonly grid: TeachGrid;
  readonly columns: readonly TeachColumn[];
  /** The radius of the mark-sized area read in each cell. */
  readonly cell_mm: number;
  readonly marking_style: MarkingStyle;
  readonly correction_rules: CardProfile['correction_rules'];
}

/** The regional card's columns, placed on a card whose black column was found. */
export function startingColumns(grid: TeachGrid): TeachColumn[] {
  const regional = [
    { score: 0, across: -1.53 },
    { score: 1, across: -1.01 },
    { score: 2, across: 0.99 },
    { score: 3, across: 1.52 },
    { score: 5, across: 2.02 },
  ];
  return regional.map((c) => ({
    score: c.score,
    x_mm: round(grid.origin_x_mm + c.across * grid.unit_mm, 1),
  }));
}

/** Evenly spread columns for scores 0 1 2 3 5 across a card without a black column. */
export function evenColumns(card: CardSize): TeachColumn[] {
  const scores = [0, 1, 2, 3, 5];
  const step = card.width_mm / (scores.length + 1);
  return scores.map((score, i) => ({ score, x_mm: round(step * (i + 1), 1) }));
}

/** A cell radius suited to each marking style: a punched hole, a pen hole, an inked digit. */
export const CELL_MM: Readonly<Record<MarkingStyle, number>> = {
  punch: 1.5,
  'pen-hole': 1,
  ink: 1.6,
};

function round(x: number, places: number): number {
  const f = 10 ** places;
  return Math.round(x * f) / f;
}

/** How well thresholds read the taught cards. */
export interface TeachCheck {
  readonly cards: number;
  readonly rows: number;
  /** Rows read with the score the club gave (or, for a row with no mark, read as empty). */
  readonly right: number;
  /** Rows left to a person. */
  readonly toPerson: number;
  /** Rows read with a score the club says is wrong. */
  readonly wrong: number;
  /** The least confidence margin among rows read right (1 when none). */
  readonly leastMargin: number;
  /** Each card's rows as these thresholds read them. */
  readonly readings: readonly (readonly TeachRow[])[];
}

/** What a row really holds: a score, or no mark. */
export type TeachAnswer = number | null;

export type TeachVerdict = 'right' | 'person' | 'wrong';

export interface TeachRow {
  readonly reading: RowReading;
  readonly answer: TeachAnswer;
  readonly verdict: TeachVerdict;
}

/** A marked card taught to the wizard: each row's measured change, and what the club says. */
export interface TaughtCard {
  readonly darkness: readonly (readonly number[])[];
  readonly answers: readonly TeachAnswer[];
}

/** Whether a reading matches what the row really holds. */
export function verdictOf(reading: RowReading, answer: TeachAnswer): TeachVerdict {
  if (answer === null) {
    if (reading.flag === 'NO_PUNCH') return 'right';
    return reading.value === null ? 'person' : 'wrong';
  }
  if (reading.value === null) return 'person';
  return reading.value === answer ? 'right' : 'wrong';
}

type Decider = Pick<ReaderProfile, 'values' | 'inverseCorrections'>;

/** How these thresholds read the taught cards. */
export function checkThresholds(
  cards: readonly TaughtCard[],
  reader: Decider,
  thresholds: { readonly mark: number; readonly confidence_gap: number },
): TeachCheck {
  const profile = {
    ...reader,
    markThreshold: thresholds.mark,
    minMargin: thresholds.confidence_gap,
  };
  let rows = 0;
  let right = 0;
  let toPerson = 0;
  let wrong = 0;
  let leastMargin = 1;
  const readings = cards.map((card) =>
    card.darkness.map((darkness, k) => {
      const reading = decideRow(k + 1, darkness, profile);
      const answer = card.answers[k] ?? null;
      const verdict = verdictOf(reading, answer);
      rows++;
      if (verdict === 'right') {
        right++;
        leastMargin = Math.min(leastMargin, reading.margin);
      } else if (verdict === 'person') toPerson++;
      else wrong++;
      return { reading, answer, verdict };
    }),
  );
  return { cards: cards.length, rows, right, toPerson, wrong, leastMargin, readings };
}

/** Thresholds proposed from the taught cards, and how they read them. */
export interface ProposedThresholds {
  readonly mark: number;
  readonly confidence_gap: number;
  readonly check: TeachCheck;
}

/**
 * A row read wrong counts as this many rows left to a person when choosing thresholds: a wrong
 * reading is the expensive error, but one mistyped answer mustn't send most of the card to a
 * person. The wizard shows every row read wrong, so the club checks it.
 */
const WRONG_COST = 10;

/**
 * Propose the thresholds that read the taught cards best: as many rows read right as possible,
 * each row read wrong counting against that as {@link WRONG_COST} rows, with the mark threshold in the middle of the
 * widest range that does so (the furthest from both a faint mark and a dirty blank). The
 * confidence gap starts at the marking style's and is only lowered (at most to half) when it
 * would send rows that read right to a person.
 */
export function proposeThresholds(
  cards: readonly TaughtCard[],
  reader: Decider,
  style: MarkingStyle,
): ProposedThresholds {
  const start = MARKING_STYLE_THRESHOLDS[style];
  // Each mark is judged with the least gap tScore would propose, so a mark that only reads
  // because nothing has to be clear is never chosen.
  const floor = start.confidence_gap / 2;
  const score = (mark: number) => checkThresholds(cards, reader, { mark, confidence_gap: floor });
  const marks: number[] = [];
  for (let m = 8; m <= 92; m++) marks.push(m / 100);
  const checks = marks.map(score);
  const value = (c: TeachCheck) => c.right - WRONG_COST * c.wrong;
  const better = (a: TeachCheck, b: TeachCheck) =>
    value(a) !== value(b) ? value(a) > value(b) : a.wrong < b.wrong;
  let best = checks[0] as TeachCheck;
  for (const c of checks) if (better(c, best)) best = c;
  // The longest run of marks that read as well as the best: choose its middle.
  let runStart = -1;
  let longest = { from: 0, to: 0 };
  checks.forEach((c, i) => {
    const same = c.wrong === best.wrong && c.right === best.right;
    if (same && runStart < 0) runStart = i;
    if (runStart >= 0 && (!same || i === checks.length - 1)) {
      const to = same ? i : i - 1;
      if (to - runStart > longest.to - longest.from) longest = { from: runStart, to };
      runStart = -1;
    }
  });
  if (best.right === 0)
    longest = { from: marks.indexOf(start.mark), to: marks.indexOf(start.mark) };
  const mark = marks[Math.round((longest.from + longest.to) / 2)] ?? start.mark;
  // The gap: the style's, unless rows that read right would go to a person.
  const loose = checkThresholds(cards, reader, { mark, confidence_gap: floor });
  let gap = start.confidence_gap;
  if (loose.right > 0 && loose.leastMargin < gap) {
    gap = Math.max(floor, Math.floor(loose.leastMargin * 90) / 100);
  }
  gap = round(gap, 2);
  return {
    mark,
    confidence_gap: gap,
    check: checkThresholds(cards, reader, { mark, confidence_gap: gap }),
  };
}

/**
 * The card profile the wizard saves: the layout in grid units, with the grid placed on the card
 * so it can always be read from corners too. Always `assisted`.
 */
export function taughtProfile(
  layout: TeachLayout,
  thresholds: Pick<CardThresholds, 'mark' | 'confidence_gap'> & {
    readonly tuned_from: CardThresholds['tuned_from'];
  },
): CardProfile {
  const g = layout.grid;
  const unit = g.unit_mm;
  return {
    schema: 'tscore.card_profile/1',
    id: layout.id,
    name: layout.name,
    card: { width_mm: layout.card.width_mm, height_mm: layout.card.height_mm },
    rows: layout.rows,
    grid: {
      unit: 'column-width',
      row_pitch: round(g.row_mm / unit, 4),
      cell_radius: round(layout.cell_mm / unit, 4),
      on_card: { unit_mm: unit, origin_x_mm: g.origin_x_mm, origin_y_mm: g.origin_y_mm },
    },
    columns: layout.columns.map((c) => ({
      score: c.score,
      across: round((c.x_mm - g.origin_x_mm) / unit, 3),
    })),
    locator: layout.locator,
    marking_style: layout.marking_style,
    correction_rules: layout.correction_rules,
    thresholds: {
      mark: thresholds.mark,
      confidence_gap: thresholds.confidence_gap,
      colour_channel: MARKING_STYLE_THRESHOLDS[layout.marking_style].colour_channel,
      tuned_from: thresholds.tuned_from,
    },
    trust: 'assisted',
  };
}

/**
 * The blank reference from a straightened blank card ({@link straightenCard}, or the picture
 * kept with a taught profile): what every cell looks like before it's marked.
 */
export function blankReferenceFromStraight(
  straight: GreyImage,
  profile: CardProfile,
  reader: ReaderProfile = readerProfile(profile),
): BlankReference {
  const onCard = profile.grid.on_card;
  if (!onCard) throw new Error(`Card profile ${profile.id} doesn't say where its grid sits.`);
  const s = straight.width / profile.card.width_mm;
  const H = profile.card.height_mm;
  return blankReferenceFrom(reader, (u, v) => {
    const x = onCard.origin_x_mm + v * onCard.unit_mm;
    const y = onCard.origin_y_mm + u * onCard.unit_mm;
    return sample(straight, x * s - 0.5, (H - y) * s - 0.5) / 255;
  });
}

/**
 * Read a marked card while teaching: by its black column, or from the corners marked on it.
 * Always against the taught blank card.
 */
export function readTeachCard(
  frame: RgbaImage,
  profile: CardProfile,
  reference: BlankReference,
  corners?: CardCorners,
): ReadResult {
  const reader = readerProfile(profile);
  if (corners) return readCardFromCorners(frame, corners, profile, reader, reference);
  if (profile.locator === 'manual-corners') return { ok: false, reason: 'NO_CARD' };
  return readCard(frame, reader, reference);
}

/** Where a drawn practice card lies in its picture. */
const PRACTICE_PLACE = { width: 640, height: 900, columnWidth: 34, angle: 3 } as const;

/** A drawn practice card for the wizard: the regional card's design, blank or marked. */
export interface PracticeCard {
  readonly frame: RgbaImage;
  /** What each row really holds. */
  readonly answers: readonly TeachAnswer[];
  /** Where its corners are (for tests: the wizard has them marked by hand). */
  readonly corners: CardCorners;
}

/** A small, repeatable random number generator (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a practice card to teach (invented scores only): `seed` 0 is the blank card. Marked
 * cards have a score in most rows, some rows left empty, and (when the card's rule allows) an
 * all-but-one correction.
 */
export function practiceCard(
  seed: number,
  marking: MarkingStyle = 'punch',
  inverse = true,
): PracticeCard {
  const rand = random(seed * 7919 + 13);
  const values = REGIONAL_16.values;
  const answers: TeachAnswer[] = [];
  const punches: number[][] = [];
  for (let k = 0; k < REGIONAL_16.rows; k++) {
    if (seed === 0 || k >= 12 + (seed % 4)) {
      answers.push(null);
      punches.push([]);
      continue;
    }
    const value = values[Math.floor(rand() * values.length)] ?? 0;
    answers.push(value);
    if (inverse && (k + seed) % 9 === 4) punches.push(values.filter((v) => v !== value));
    else punches.push([value]);
  }
  const placed: Partial<SyntheticCard> = {
    ...PRACTICE_PLACE,
    angle: PRACTICE_PLACE.angle * (seed % 2 ? -1 : 1),
    seed: seed + 1,
    noise: 4,
  };
  const frame = syntheticCard({ ...placed, punches, marking });
  const regional = cardProfile('regional-16');
  if (!regional) throw new Error('The regional card profile is missing.');
  return { frame, answers, corners: syntheticCorners(regional, placed) };
}
