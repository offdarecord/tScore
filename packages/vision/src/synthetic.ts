/**
 * Synthetic regional cards for tests and practice: the card drawn on a black mat at any
 * position, angle, size and lighting, with chosen punches (including inverse corrections and
 * torn holes). Geometry matches the reference photo, in column widths (see REGIONAL_16).
 *
 * Invented data only: no real card or rider is ever drawn.
 */
import { PRINT, printedCell } from './blank-reference.js';
import type { RgbaImage } from './image.js';
import { REGIONAL_16, type ReaderProfile } from './reader.js';

/** How the scores are marked: punched, poked with a pen, or inked over the digit (#104). */
export type SyntheticMarking = 'punch' | 'pen-hole' | 'ink';

/** Ink colours, as red, green, blue (how much of each the ink lets through, 0–255). */
export const INK_COLOURS = {
  black: [40, 40, 46],
  blue: [40, 70, 165],
  red: [190, 40, 45],
} as const;
export type InkColour = keyof typeof INK_COLOURS;

export interface SyntheticCard {
  /** Per section (index 0 = section 1): the values punched. Missing = none. */
  readonly punches: readonly (readonly number[])[];
  /** Per section: values whose hole is torn, only partly open. */
  readonly torn?: readonly (readonly number[])[];
  /** How the `punches` are made (default: punched holes). */
  readonly marking?: SyntheticMarking;
  /** The ink's colour, for ink marks (default: black). */
  readonly ink?: InkColour;
  readonly width?: number;
  readonly height?: number;
  /** Column width in pixels. */
  readonly columnWidth?: number;
  /** Rotation in degrees, clockwise. */
  readonly angle?: number;
  /** Centre of the column, as a fraction of the frame. */
  readonly at?: { readonly x: number; readonly y: number };
  /** Brightness falls off across the frame by up to this much (0–1). */
  readonly shade?: number;
  /** Random noise, in grey levels. */
  readonly noise?: number;
  readonly seed?: number;
  /** Paper brightness (0–255). */
  readonly paper?: number;
  /** A label's QR modules (true = dark), stuck on the header above the grid. */
  readonly label?: readonly (readonly boolean[])[];
}

const { mat: MAT, ink: INK, line: LINE } = PRINT;

/** Ink over the paper: a share (0–1) of light let through, per colour; 1 = no ink. */
type Tint = readonly [number, number, number];

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

/** Grey level at a point on the card, in column widths: u up from the column's bottom, v across. */
function cardAt(
  u: number,
  v: number,
  card: SyntheticCard,
  profile: ReaderProfile,
  paper: number,
  tint: { value: Tint | null },
): number {
  const p = profile.pitch;
  const gridTop = (profile.rows + 1) * p; // 16 rows plus the header row
  // The card: from the Total box below the grid to the header area above it.
  if (v < -1.95 || v > 2.45 || u < -1.6 || u > gridTop + 4.6) return MAT;
  // The label's QR, about 3.4 column widths square, with a white quiet zone.
  if (card.label && u > gridTop + 0.4 && u < gridTop + 4.4 && v > -1.7 && v < 2.3) {
    const n = card.label.length;
    const size = 3.4;
    const mx = Math.floor(((v + 1.4) / size) * n);
    const my = Math.floor(((gridTop + 4.1 - u) / size) * n);
    if (mx >= 0 && my >= 0 && mx < n && my < n) return card.label[my]?.[mx] ? INK : paper;
    return paper;
  }
  // Holes first: they show the mat through the card.
  for (let k = 0; k < profile.rows; k++) {
    const section = k + 1;
    const uc = (profile.rows - section + 0.5) * p;
    if (Math.abs(u - uc) > 0.3) continue;
    for (let c = 0; c < profile.values.length; c++) {
      const value = profile.values[c] ?? 0;
      const dx = v - (profile.cellOffsets[c] ?? 0);
      const dy = u - uc;
      const r2 = dx * dx + dy * dy;
      const punched = card.punches[k]?.includes(value);
      const torn = card.torn?.[k]?.includes(value);
      const marking = card.marking ?? 'punch';
      if (punched && marking === 'punch' && r2 < 0.2 * 0.2) return MAT;
      // A torn hole: only a sliver is open.
      if (torn && r2 < 0.2 * 0.2 && dx > 0.06) return MAT;
      if (punched && marking === 'pen-hole' && penHole(dx, dy, k * 7 + c)) return MAT;
      const printed = printedCell(dx, dy);
      if (punched && marking === 'ink' && inked(dx, dy, k * 7 + c)) {
        const [r, g, b] = INK_COLOURS[card.ink ?? 'black'];
        tint.value = [r / 255, g / 255, b / 255];
      }
      if (printed !== null) return printed;
    }
  }
  // The black section column (with the header cell), white numbers in it.
  if (Math.abs(v) <= 0.5 && u >= 0 && u <= gridTop) {
    const row = Math.floor(u / p);
    const uc = (row + 0.5) * p;
    if (Math.abs(v) < 0.16 && Math.abs(u - uc) < 0.18) return paper;
    return INK;
  }
  // Printed row lines across the card.
  if (u >= -0.02 && u <= gridTop + 0.02) {
    const j = Math.round(u / p);
    if (Math.abs(u - j * p) < 0.025) return LINE;
  }
  return paper;
}

/** A pen poked through the digit: a small ragged hole, a little off the cell's centre. */
function penHole(dx: number, dy: number, cell: number): boolean {
  const cx = Math.sin(cell * 12.9898) * 0.04;
  const cy = Math.cos(cell * 78.233) * 0.04;
  const x = dx - cx;
  const y = dy - cy;
  const angle = Math.atan2(y, x);
  const ragged = 0.085 + 0.015 * Math.sin(angle * 5 + cell);
  return x * x + y * y < ragged * ragged;
}

/** Ink scribbled over the digit: slanted strokes across a rough disc. */
function inked(dx: number, dy: number, cell: number): boolean {
  const r = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  if (r > 0.18 + 0.02 * Math.sin(angle * 3 + cell)) return false;
  const stroke = (dx + dy * 0.6 + cell * 0.013) / 0.05;
  return stroke - Math.floor(stroke) < 0.75;
}

/** Draw the card. */
export function syntheticCard(
  card: SyntheticCard,
  profile: ReaderProfile = REGIONAL_16,
): RgbaImage {
  const width = card.width ?? 720;
  const height = card.height ?? 960;
  const W = card.columnWidth ?? 44;
  const angle = ((card.angle ?? 0) * Math.PI) / 180;
  const paper = card.paper ?? 235;
  const rand = random(card.seed ?? 1);
  // Column bottom-centre position: the column's middle sits at `at`.
  const mid = { x: (card.at?.x ?? 0.5) * width, y: (card.at?.y ?? 0.55) * height };
  const half = ((profile.rows + 1) * profile.pitch * W) / 2;
  const up = { x: Math.sin(angle), y: -Math.cos(angle) };
  const right = { x: -up.y, y: up.x };
  const bottom = { x: mid.x - up.x * half, y: mid.y - up.y * half };
  const data = new Uint8ClampedArray(width * height * 4);
  const shade = card.shade ?? 0;
  const noise = card.noise ?? 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 2 × 2 supersampling for smooth edges.
      const sum = [0, 0, 0];
      for (const [ox, oy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ] as const) {
        const dx = x + ox - bottom.x;
        const dy = y + oy - bottom.y;
        const u = (dx * up.x + dy * up.y) / W;
        const v = (dx * right.x + dy * right.y) / W;
        const tint: { value: Tint | null } = { value: null };
        const g = cardAt(u, v, card, profile, paper, tint);
        for (let ch = 0; ch < 3; ch++) sum[ch] = (sum[ch] ?? 0) + g * (tint.value?.[ch] ?? 1);
      }
      const light = 1 - shade * (x / width) * 0.6 - shade * (y / height) * 0.4;
      const grain = (rand() - 0.5) * 2 * noise;
      const i = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) data[i + ch] = ((sum[ch] ?? 0) / 4) * light + grain;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}
