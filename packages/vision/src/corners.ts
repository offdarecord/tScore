/**
 * Read a card from its four corners, clicked by the desk on the camera picture (#106): the
 * `manual-corners` locator, and the fallback when a card can't be found by itself.
 *
 * The corners give the card's outline, so tScore straightens it (a perspective map from the
 * card's millimetres to the picture), places the grid by the profile's `grid.on_card`, and reads
 * each cell as usual. The card lies on the black mat, so the mat just outside it gives the black
 * level and the card itself the paper.
 *
 * Corners that can't be the card (crossed, off the picture, the wrong shape for this card) are
 * refused rather than read: the desk clicks them again.
 */
import type { CardProfile } from '@tscore/core';
import { blankReferenceFor, type BlankReference } from './blank-reference.js';
import { sample, toGrey, type RgbaImage } from './image.js';
import type { SyntheticCard } from './synthetic.js';
import {
  readCells,
  readerProfile,
  type CardPose,
  type Point,
  type ReaderProfile,
  type ReadResult,
} from './reader.js';

/** The card's corners in the picture, in pixels, as it lies (header at the top). */
export interface CardCorners {
  readonly topLeft: Point;
  readonly topRight: Point;
  readonly bottomRight: Point;
  readonly bottomLeft: Point;
}

/** The order the desk clicks the corners in. */
export const CORNER_ORDER = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
export type CornerName = (typeof CORNER_ORDER)[number];

/** Whether a profile says where its grid sits on the card, so it can be read from corners. */
export function canReadFromCorners(profile: CardProfile): boolean {
  return profile.grid.on_card !== undefined;
}

/** A 3 × 3 perspective map, row by row, with the last entry 1. */
type Homography = readonly number[];

/** The perspective map taking each `from` point to its `to` point (four of each). */
export function homography(from: readonly Point[], to: readonly Point[]): Homography | null {
  // Solve the 8 × 8 system for h0..h7 (h8 = 1), by Gaussian elimination.
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i] ?? { x: 0, y: 0 };
    const { x: X, y: Y } = to[i] ?? { x: 0, y: 0 };
    a.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
    a.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  }
  for (let c = 0; c < 8; c++) {
    let pivot = c;
    for (let r = c + 1; r < 8; r++) {
      if (Math.abs(a[r]?.[c] ?? 0) > Math.abs(a[pivot]?.[c] ?? 0)) pivot = r;
    }
    const top = a[pivot];
    if (!top || Math.abs(top[c] ?? 0) < 1e-12) return null;
    [a[c], a[pivot]] = [top, a[c] ?? top];
    for (let r = 0; r < 8; r++) {
      const row = a[r];
      if (r === c || !row) continue;
      const f = (row[c] ?? 0) / (top[c] ?? 1);
      for (let k = c; k < 9; k++) row[k] = (row[k] ?? 0) - f * (top[k] ?? 0);
    }
  }
  return [...a.map((row, i) => (row[8] ?? 0) / (row[i] ?? 1)), 1];
}

/** Where a point lands under a perspective map. */
export function project(h: Homography, p: Point): Point {
  const w = (h[6] ?? 0) * p.x + (h[7] ?? 0) * p.y + (h[8] ?? 1);
  return {
    x: ((h[0] ?? 0) * p.x + (h[1] ?? 0) * p.y + (h[2] ?? 0)) / w,
    y: ((h[3] ?? 0) * p.x + (h[4] ?? 0) * p.y + (h[5] ?? 0)) / w,
  };
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Point) => Math.hypot(a.x, a.y);
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

/**
 * Whether four clicked corners can be this card: inside the picture, going round the card
 * clockwise with no crossing, big enough to read, and about the card's shape (camera tilt and
 * a careless click allow some slack).
 */
export function cornersFit(
  corners: CardCorners,
  card: { readonly width_mm: number; readonly height_mm: number },
  frame: { readonly width: number; readonly height: number },
): boolean {
  const pts = CORNER_ORDER.map((n) => corners[n]);
  if (pts.some((p) => p.x < 0 || p.y < 0 || p.x >= frame.width || p.y >= frame.height)) {
    return false;
  }
  // Clockwise on screen (y down): every turn the same way, so convex and not crossed.
  for (let i = 0; i < 4; i++) {
    const a = pts[i] as Point;
    const b = pts[(i + 1) % 4] as Point;
    const c = pts[(i + 2) % 4] as Point;
    if (cross(sub(b, a), sub(c, b)) <= 0) return false;
  }
  const width =
    (len(sub(corners.topRight, corners.topLeft)) +
      len(sub(corners.bottomRight, corners.bottomLeft))) /
    2;
  const height =
    (len(sub(corners.bottomLeft, corners.topLeft)) +
      len(sub(corners.bottomRight, corners.topRight))) /
    2;
  if (width < 40) return false;
  const ratio = height / width / (card.height_mm / card.width_mm);
  return ratio > 0.75 && ratio < 1.33;
}

/**
 * Read a card from its four corners in the picture. The profile must say where its grid sits on
 * the card (`grid.on_card`).
 */
export function readCardFromCorners(
  frame: RgbaImage,
  corners: CardCorners,
  profile: CardProfile,
  reader: ReaderProfile = readerProfile(profile),
  reference: BlankReference = blankReferenceFor(reader),
): ReadResult {
  const onCard = profile.grid.on_card;
  if (!onCard) return { ok: false, reason: 'NO_CARD' };
  if (!cornersFit(corners, profile.card, frame)) return { ok: false, reason: 'UNSURE' };
  const { width_mm: W, height_mm: H } = profile.card;
  // Card millimetres (x right from the left edge, y up from the bottom) to picture pixels.
  const h = homography(
    [
      { x: 0, y: H },
      { x: W, y: H },
      { x: W, y: 0 },
      { x: 0, y: 0 },
    ],
    CORNER_ORDER.map((n) => corners[n]),
  );
  if (!h) return { ok: false, reason: 'UNSURE' };
  const grey = toGrey(frame, reader.channel);
  const onPicture = (x: number, y: number) => project(h, { x, y });
  const atMm = (x: number, y: number) => {
    const p = onPicture(x, y);
    return sample(grey, p.x, p.y);
  };
  const grid = (u: number, v: number): Point => ({
    x: onCard.origin_x_mm + v * onCard.unit_mm,
    y: onCard.origin_y_mm + u * onCard.unit_mm,
  });
  const at = (u: number, v: number) => {
    const p = grid(u, v);
    return atMm(p.x, p.y);
  };

  // Black: the mat just outside the card, all round. Paper: the card's lighter part.
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
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
  if (paper - black < 40) return { ok: false, reason: 'UNSURE' };

  const pitch = reader.pitch;
  const rows = readCells(at, reader, reference, pitch, paper, black);
  // The pose as the rest of the desk knows it (the label sits above the grid): measured at the
  // grid's origin, which is near enough straight under a document camera.
  const bottom = onPicture(onCard.origin_x_mm, onCard.origin_y_mm);
  const across = sub(onPicture(onCard.origin_x_mm + onCard.unit_mm, onCard.origin_y_mm), bottom);
  const along = sub(onPicture(onCard.origin_x_mm, onCard.origin_y_mm + onCard.unit_mm), bottom);
  const width = len(across);
  const pose: CardPose = {
    bottom,
    up: { x: along.x / len(along), y: along.y / len(along) },
    right: { x: across.x / width, y: across.y / width },
    width,
    pitch,
    length: (reader.rows + 1) * pitch * width,
  };
  return { ok: true, card: { profile: reader.id, pose, rows, paper, black } };
}

/**
 * Where a synthetic card's corners are, for tests and practice: the regional card drawn by
 * `syntheticCard` with the same placement.
 */
export function syntheticCorners(
  profile: CardProfile,
  placed: Partial<SyntheticCard> = {},
): CardCorners {
  const onCard = profile.grid.on_card;
  if (!onCard) throw new Error(`Card profile ${profile.id} doesn't say where its grid sits.`);
  const width = placed.width ?? 720;
  const height = placed.height ?? 960;
  const px = (placed.columnWidth ?? 44) / onCard.unit_mm;
  const angle = ((placed.angle ?? 0) * Math.PI) / 180;
  const up = { x: Math.sin(angle), y: -Math.cos(angle) };
  const right = { x: -up.y, y: up.x };
  const mid = { x: (placed.at?.x ?? 0.5) * width, y: (placed.at?.y ?? 0.55) * height };
  const half = ((profile.rows + 1) * profile.grid.row_pitch * onCard.unit_mm) / 2;
  const corner = (x: number, y: number): Point => {
    const dx = (x - onCard.origin_x_mm) * px;
    const dy = (y - onCard.origin_y_mm - half) * px;
    return { x: mid.x + right.x * dx + up.x * dy, y: mid.y + right.y * dx + up.y * dy };
  };
  const { width_mm: W, height_mm: H } = profile.card;
  return {
    topLeft: corner(0, H),
    topRight: corner(W, H),
    bottomRight: corner(W, 0),
    bottomLeft: corner(0, 0),
  };
}
