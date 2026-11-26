/**
 * Synthetic regional cards for tests and practice: the card drawn on a black mat at any
 * position, angle, size and lighting, with chosen punches (including inverse corrections and
 * torn holes). Geometry matches the reference photo, in column widths (see REGIONAL_16).
 *
 * Invented data only: no real card or rider is ever drawn.
 */
import type { RgbaImage } from './image.js';
import { REGIONAL_16, type ReaderProfile } from './reader.js';

export interface SyntheticCard {
  /** Per section (index 0 = section 1): the values punched. Missing = none. */
  readonly punches: readonly (readonly number[])[];
  /** Per section: values whose hole is torn, only partly open. */
  readonly torn?: readonly (readonly number[])[];
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

const MAT = 22;
const INK = 18;
const LINE = 90;
const RING = 105;
const GLYPH = 70;

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
      if (punched && r2 < 0.2 * 0.2) return MAT;
      // A torn hole: only a sliver is open.
      if (torn && r2 < 0.2 * 0.2 && dx > 0.06) return MAT;
      if (Math.abs(Math.sqrt(r2) - 0.27) < 0.025) return RING;
      if (Math.abs(dx) < 0.035 && Math.abs(dy) < 0.12) return GLYPH;
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
      let sum = 0;
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
        sum += cardAt(u, v, card, profile, paper);
      }
      let g = sum / 4;
      g *= 1 - shade * (x / width) * 0.6 - shade * (y / height) * 0.4;
      g += (rand() - 0.5) * 2 * noise;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = g;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}
