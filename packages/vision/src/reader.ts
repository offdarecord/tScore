/**
 * Read a punched regional card from a camera frame (architecture §5.3).
 *
 * The card locates itself: its black section column is the one large, long, dark shape inside
 * the white card, so its position, angle and width give the whole grid. Everything is measured
 * in column widths, so camera height and zoom don't matter, and no marker mat is needed. The
 * card sits on a matte black backing, so a hole reads as black.
 *
 * 1. Find the column (on a shrunk copy, for speed), then refine its edges and ends at full size.
 * 2. Find the row pitch from the printed row lines beside the column.
 * 3. Measure each value cell's darkness, normalised between the card's paper and the black of
 *    the column, then decide each row with {@link decodeRow}.
 *
 * Assumes the card is roughly upright (the header at the top, within about 45°), as the rough
 * guide on the mat keeps it.
 */
import { cardProfile, type CardProfile } from '@tscore/core';
import {
  otsu,
  sample,
  shrink,
  toGrey,
  type Channel,
  type GreyImage,
  type RgbaImage,
} from './image.js';
import { blankReferenceFor, type BlankReference } from './blank-reference.js';
import { decodeRow, type RowFlag } from './row-decision.js';

/**
 * What the reader needs from a card profile (presets/card-profiles/, #105): geometry in column
 * widths from the column's centre line, and the reading thresholds.
 */
export interface ReaderProfile {
  readonly id: string;
  readonly rows: number;
  /** Score values, in the order of `cellOffsets`. */
  readonly values: readonly number[];
  /** Each value cell's centre across the card (negative = left of the column). */
  readonly cellOffsets: readonly number[];
  /** Expected row height, used as the starting point for the search. */
  readonly pitch: number;
  /** Radius of the hole-sized area measured in each cell. */
  readonly cellRadius: number;
  /** A cell darker than this (on the 0–1 scale) counts as punched. */
  readonly markThreshold: number;
  /** Below this margin a row is LOW_CONF: torn or partial holes go to a person. */
  readonly minMargin: number;
  /** The colour darkness is measured in. */
  readonly channel: Channel;
  /** Whether all-but-one marks read as a correction to the unmarked value. */
  readonly inverseCorrections: boolean;
}

/**
 * The reader's view of a card profile. Only cards this reader can find are accepted: the
 * black-column locator (other locators come with #106). Punched, pen-hole and ink marks are all
 * read as change from the blank card, with the profile's thresholds and colour.
 */
export function readerProfile(profile: CardProfile): ReaderProfile {
  if (profile.locator !== 'black-column') {
    throw new Error(`Card profile ${profile.id}: ${profile.locator} cards can't be read yet.`);
  }
  return {
    id: profile.id,
    rows: profile.rows,
    values: profile.columns.map((c) => c.score),
    cellOffsets: profile.columns.map((c) => c.across),
    pitch: profile.grid.row_pitch,
    cellRadius: profile.grid.cell_radius,
    markThreshold: profile.thresholds.mark,
    minMargin: profile.thresholds.confidence_gap,
    channel: profile.thresholds.colour_channel,
    inverseCorrections: profile.correction_rules === 'inverse-all-but-one',
  };
}

function builtIn(id: string): ReaderProfile {
  const profile = cardProfile(id);
  if (!profile) throw new Error(`Card profile ${id} is not installed.`);
  return readerProfile(profile);
}

/** The regional card: `0 1 | SECTN | 2 3 5`, 16 rows (presets/card-profiles/regional-16.json). */
export const REGIONAL_16: ReaderProfile = builtIn('regional-16');

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where the card is in the frame. */
export interface CardPose {
  /** The column's centre line at its bottom end (bottom of the last row). */
  readonly bottom: Point;
  /** Unit vector up the column (towards the header). */
  readonly up: Point;
  /** Unit vector across, to the card's right (towards 2 3 5). */
  readonly right: Point;
  /** Column width in pixels. */
  readonly width: number;
  /** Row height in column widths. */
  readonly pitch: number;
  /** The column's length in pixels. */
  readonly length: number;
}

export interface RowReading {
  /** Section number, from 1. */
  readonly section: number;
  /** Each value cell's darkness: 0 = paper, 1 = as dark as the column. */
  readonly darkness: readonly number[];
  readonly punched: readonly boolean[];
  /** The score read, or null with a flag. */
  readonly value: number | null;
  readonly inverse: boolean;
  readonly flag?: RowFlag | 'LOW_CONF';
  /** How clearly punched and unpunched cells differ (0 = not at all, 1 = perfectly). */
  readonly margin: number;
}

export interface CardReading {
  readonly profile: string;
  readonly pose: CardPose;
  readonly rows: readonly RowReading[];
  /** Darkness levels used: paper and black, in grey levels. */
  readonly paper: number;
  readonly black: number;
}

export type ReadResult =
  | { readonly ok: true; readonly card: CardReading }
  | {
      readonly ok: false;
      /** UNSURE: a card is there but its grid doesn't add up (blur, glare, a fold): try again. */
      readonly reason: 'NO_CARD' | 'CARD_CUT_OFF' | 'TOO_SMALL' | 'TILTED' | 'UNSURE';
    };

/** The regional card's punch threshold (its profile's `thresholds.mark`). */
export const PUNCH_THRESHOLD = REGIONAL_16.markThreshold;
/** The regional card's least margin (its profile's `thresholds.confidence_gap`). */
export const MIN_MARGIN = REGIONAL_16.minMargin;

/**
 * An unmarked cell must look blank: changed from the blank card by less than this share of the
 * mark threshold. The printed digit is in the reference, so a blank cell reads near 0; a cell
 * part-way (a torn or half-made hole, a smudge, a faint mark) goes to a person.
 */
const PARTIAL = 0.5;

/** The work size for finding the card: about 320 pixels on the long side. */
const WORK_SIZE = 320;

interface Blob {
  readonly pixels: number[];
  readonly touchesEdge: boolean;
}

/** Dark connected regions of a thresholded image (4-connected). */
function darkBlobs(img: GreyImage, threshold: number, minArea: number): Blob[] {
  const { width: w, height: h, data } = img;
  const seen = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || (data[start] ?? 0) > threshold) continue;
    const pixels: number[] = [];
    let touchesEdge = false;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop() ?? 0;
      pixels.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
      const next = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];
      for (const n of next) {
        if (n >= 0 && !seen[n] && (data[n] ?? 0) <= threshold) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (pixels.length >= minArea) blobs.push({ pixels, touchesEdge });
  }
  return blobs;
}

/** The dark areas, closed then opened by `r` pixels: 0 where dark, 255 where light. */
function open(img: GreyImage, threshold: number, r: number): GreyImage {
  const { width: w, height: h } = img;
  let dark = new Uint8Array(w * h);
  for (let i = 0; i < dark.length; i++) dark[i] = (img.data[i] ?? 0) <= threshold ? 1 : 0;
  const pass = (src: Uint8Array, keep: (count: number, size: number) => boolean) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let count = 0;
        let size = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            size++;
            count += src[yy * w + xx] ?? 0;
          }
        }
        out[y * w + x] = keep(count, size) ? 1 : 0;
      }
    }
    return out;
  };
  // Close first (dilate, erode): fills the white section numbers, so the column stays whole.
  dark = pass(dark, (c) => c > 0);
  dark = pass(dark, (c, n) => c === n);
  // Then open (erode, dilate): removes thin printed lines.
  dark = pass(dark, (c, n) => c === n);
  dark = pass(dark, (c) => c > 0);
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = dark[i] ? 0 : 255;
  return { width: w, height: h, data };
}

interface Axis {
  readonly cx: number;
  readonly cy: number;
  readonly up: Point;
  readonly length: number;
  readonly width: number;
}

/** A blob's main axis (PCA), with its length and width along and across it. */
function axisOf(blob: Blob, w: number): Axis {
  let sx = 0;
  let sy = 0;
  for (const p of blob.pixels) {
    sx += p % w;
    sy += Math.floor(p / w);
  }
  const n = blob.pixels.length;
  const cx = sx / n;
  const cy = sy / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const p of blob.pixels) {
    const dx = (p % w) - cx;
    const dy = Math.floor(p / w) - cy;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  let up = { x: Math.cos(angle), y: Math.sin(angle) };
  if (up.y > 0) up = { x: -up.x, y: -up.y };
  const along: number[] = [];
  const across: number[] = [];
  for (const p of blob.pixels) {
    const dx = (p % w) - cx;
    const dy = Math.floor(p / w) - cy;
    along.push(dx * up.x + dy * up.y);
    across.push(-dx * up.y + dy * up.x);
  }
  along.sort((a, b) => a - b);
  across.sort((a, b) => a - b);
  const q = (xs: number[], f: number) =>
    xs[Math.min(xs.length - 1, Math.floor(f * xs.length))] ?? 0;
  return {
    cx,
    cy,
    up,
    length: q(along, 0.995) - q(along, 0.005),
    width: q(across, 0.98) - q(across, 0.02),
  };
}

/** Find the section column: long, straight, thick, and wholly inside the frame. */
function findColumn(
  grey: GreyImage,
  radius: number,
): { axis: Axis; scale: number } | { reason: 'NO_CARD' | 'CARD_CUT_OFF' } {
  const scale = Math.max(1, Math.floor(Math.max(grey.width, grey.height) / WORK_SIZE));
  const small = shrink(grey, scale);
  // Near-black only: the column and the mat are black, printed rings and lines mid-grey.
  const sorted = Uint8Array.from(small.data).sort();
  const blackLevel = sorted[Math.floor(sorted.length * 0.02)] ?? 0;
  const threshold = blackLevel + (otsu(small) - blackLevel) * 0.6;
  // Opening (erode then dilate the dark areas) removes thin printed lines, which would
  // otherwise join the column to the card's edge and the mat.
  const opened = open(small, threshold, radius);
  const minArea = (small.width * small.height) / 2000;
  let best: { axis: Axis; score: number } | null = null;
  let cutOff = false;
  for (const blob of darkBlobs(opened, 127, minArea)) {
    const axis = axisOf(blob, small.width);
    const aspect = axis.length / Math.max(1, axis.width);
    // The column is about 11 times as long as it is wide; holes, digits and lines are not.
    if (aspect < 6 || aspect > 25 || axis.width < 3) continue;
    // Solid: most of the box it spans is dark (white section numbers take some out).
    const fill = blob.pixels.length / (axis.length * axis.width);
    if (fill < 0.55) continue;
    if (blob.touchesEdge) {
      cutOff = true;
      continue;
    }
    const score = blob.pixels.length;
    if (!best || score > best.score) best = { axis, score };
  }
  if (!best) return { reason: cutOff ? 'CARD_CUT_OFF' : 'NO_CARD' };
  const a = best.axis;
  return {
    axis: {
      cx: a.cx * scale + scale / 2,
      cy: a.cy * scale + scale / 2,
      up: a.up,
      length: a.length * scale,
      width: a.width * scale,
    },
    scale,
  };
}

/** Refine the column's centre line, width and ends at full resolution. */
function refine(
  grey: GreyImage,
  axis: Axis,
): { centre: Point; width: number; top: number; bottom: number } {
  const { up } = axis;
  const right = { x: -up.y, y: up.x };
  const at = (u: number, v: number) =>
    sample(grey, axis.cx + up.x * u + right.x * v, axis.cy + up.y * u + right.y * v);
  // Edges: across the column at points along it.
  const lefts: number[] = [];
  const rights: number[] = [];
  const reach = axis.width * 1.2;
  for (let k = 1; k < 20; k++) {
    const u = (k / 20 - 0.5) * axis.length * 0.9;
    const step = Math.max(0.5, axis.width / 60);
    const profile: number[] = [];
    for (let v = -reach; v <= reach; v += step) profile.push(at(u, v));
    const dark = Math.min(...profile);
    const light = Math.max(...profile);
    const mid = (dark + light) / 2;
    const centre = Math.floor(profile.length / 2);
    let l = centre;
    while (l > 0 && !((profile[l] ?? 0) <= mid && (profile[l - 1] ?? 0) > mid)) l--;
    let r = centre;
    while (r < profile.length - 1 && !((profile[r] ?? 0) <= mid && (profile[r + 1] ?? 0) > mid))
      r++;
    if (l > 0 && r < profile.length - 1) {
      lefts.push(-reach + l * step);
      rights.push(-reach + r * step);
    }
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const left = lefts.length ? median(lefts) : -axis.width / 2;
  const rightEdge = rights.length ? median(rights) : axis.width / 2;
  const width = rightEdge - left;
  const offset = (left + rightEdge) / 2;
  const centre = { x: axis.cx + right.x * offset, y: axis.cy + right.y * offset };
  // Ends: along the column near its edges (section numbers are in the middle), where it turns light.
  const along = (u: number) => {
    const p = (v: number) =>
      sample(grey, centre.x + up.x * u + right.x * v, centre.y + up.y * u + right.y * v);
    // Several points near both edges, so camera noise can't end the column early.
    return (p(-0.4 * width) + p(-0.33 * width) + p(0.33 * width) + p(0.4 * width)) / 4;
  };
  // Compare with the paper just beside the column (never the mat beyond the card's ends).
  const besides: number[] = [];
  const insides: number[] = [];
  for (let k = -4; k <= 4; k++) {
    const u = (k / 10) * axis.length;
    insides.push(along(u));
    for (const v of [-0.61, 0.61]) {
      besides.push(
        sample(
          grey,
          centre.x + up.x * u + right.x * v * width,
          centre.y + up.y * u + right.y * v * width,
        ),
      );
    }
  }
  const mid = (median(insides) + median(besides)) / 2;
  const step = Math.max(0.5, width / 40);
  // The end is where it stays light for a few steps, not one noisy sample.
  const end = (dir: 1 | -1) => {
    let u = 0;
    let light = 0;
    while (Math.abs(u) < axis.length) {
      u += dir * step;
      light = along(u) > mid ? light + 1 : 0;
      if (light >= 4) return u - dir * step * 3.5;
    }
    return u;
  };
  const top = end(1);
  const bottom = end(-1);
  return { centre, width, top, bottom };
}

/** Row height from the printed row lines in the gaps beside the column. */
function findPitch(grey: GreyImage, pose: Omit<CardPose, 'pitch'>, profile: ReaderProfile): number {
  const { bottom, up, right, width } = pose;
  const strip = (u: number) => {
    let sum = 0;
    let n = 0;
    for (const v of [-0.6, -0.56, 0.56, 0.6]) {
      sum += sample(
        grey,
        bottom.x + up.x * u * width + right.x * v * width,
        bottom.y + up.y * u * width + right.y * v * width,
      );
      n++;
    }
    return sum / n;
  };
  let best = profile.pitch;
  let bestScore = -Infinity;
  for (let p = profile.pitch * 0.85; p <= profile.pitch * 1.15; p += 0.002) {
    let lines = 0;
    let mids = 0;
    for (let j = 0; j <= profile.rows; j++) {
      lines += Math.min(strip(j * p - 0.01), strip(j * p), strip(j * p + 0.01));
      if (j < profile.rows) mids += strip((j + 0.5) * p);
    }
    const score = mids / profile.rows - lines / (profile.rows + 1);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/**
 * Read the card in a frame. The column's white section numbers can split it into pieces when
 * the card is small in the frame, so finding it is tried with a growing clean-up radius.
 */
export function readCard(
  frame: RgbaImage,
  profile: ReaderProfile = REGIONAL_16,
  reference: BlankReference = blankReferenceFor(profile),
): ReadResult {
  const grey = toGrey(frame, profile.channel);
  let last: ReadResult = { ok: false, reason: 'NO_CARD' };
  for (const radius of [1, 2, 3]) {
    const r = readWith(grey, profile, reference, radius);
    if (r.ok) return r;
    // Report the most useful reason: cut off, then unsure, then no card.
    const rank = (x: ReadResult) =>
      x.ok ? 0 : x.reason === 'CARD_CUT_OFF' ? 3 : x.reason === 'NO_CARD' ? 1 : 2;
    if (rank(r) > rank(last)) last = r;
  }
  return last;
}

function readWith(
  grey: GreyImage,
  profile: ReaderProfile,
  reference: BlankReference,
  radius: number,
): ReadResult {
  const threshold = profile.markThreshold;
  const found = findColumn(grey, radius);
  if ('reason' in found) return { ok: false, reason: found.reason };
  const { axis } = found;
  if (Math.abs(axis.up.x) > Math.SQRT1_2) return { ok: false, reason: 'TILTED' };
  if (axis.width < 12) return { ok: false, reason: 'TOO_SMALL' };

  const r = refine(grey, axis);
  const up = axis.up;
  const right = { x: -up.y, y: up.x };
  const bottom = { x: r.centre.x + up.x * r.bottom, y: r.centre.y + up.y * r.bottom };
  const base = { bottom, up, right, width: r.width, length: r.top - r.bottom };
  const pitch = findPitch(grey, base, profile);
  const pose: CardPose = { ...base, pitch };
  // Self-check: the column spans the header row and every score row, so its length must be
  // rows + 1 pitches. If not, the grid would be shifted: refuse rather than misread.
  const rowsSpanned = base.length / r.width / pitch;
  if (Math.abs(rowsSpanned - (profile.rows + 1)) > 0.45) return { ok: false, reason: 'UNSURE' };

  const at = (u: number, v: number) =>
    sample(
      grey,
      bottom.x + (up.x * u + right.x * v) * r.width,
      bottom.y + (up.y * u + right.y * v) * r.width,
    );
  // Reference levels: the column's own black, and the paper between the cells mid-row.
  const blacks: number[] = [];
  const papers: number[] = [];
  for (let k = 0; k < profile.rows; k++) {
    const u = (k + 0.5) * pitch;
    blacks.push(at(u, -0.36), at(u, 0.36));
    papers.push(at(u, -0.61), at(u, 0.61));
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const black = median(blacks);
  const paper = median(papers);
  if (paper - black < 40) return { ok: false, reason: 'NO_CARD' };

  const points = reference.points;
  const rows: RowReading[] = [];
  for (let k = 0; k < profile.rows; k++) {
    const section = k + 1;
    const u = (profile.rows - section + 0.5) * pitch;
    // Each cell's change from its blank self, normalised against this card's paper and black:
    // 0 = as the blank card, 1 = black right across the cell (a punched hole).
    const darkness = profile.cellOffsets.map((v, c) => {
      const base = (k * profile.cellOffsets.length + c) * points.length;
      let change = 0;
      let room = 0;
      points.forEach((p, i) => {
        const blank = black + (reference.levels[base + i] ?? 1) * (paper - black);
        change += blank - at(u + p.du, v + p.dv);
        room += blank - black;
      });
      return Math.min(1, Math.max(0, change / Math.max(room, 1e-9)));
    });
    const punched = darkness.map((d) => d >= threshold);
    const holes = darkness.filter((_, i) => punched[i]);
    const open = darkness.filter((_, i) => !punched[i]);
    const margin =
      Math.min(
        holes.length ? Math.min(...holes) - threshold : 1,
        open.length ? threshold - Math.max(...open) : 1,
      ) / Math.max(threshold, 1 - threshold);
    const decision = decodeRow(profile.values, punched, {
      inverse: profile.inverseCorrections,
    });
    if (decision.kind === 'flag') {
      rows.push({
        section,
        darkness,
        punched,
        value: null,
        inverse: false,
        flag: decision.flag,
        margin,
      });
    } else if (margin < profile.minMargin || open.some((d) => d > threshold * PARTIAL)) {
      rows.push({
        section,
        darkness,
        punched,
        value: null,
        inverse: decision.inverse,
        flag: 'LOW_CONF',
        margin,
      });
    } else {
      rows.push({
        section,
        darkness,
        punched,
        value: decision.value,
        inverse: decision.inverse,
        margin,
      });
    }
  }
  return { ok: true, card: { profile: profile.id, pose, rows, paper, black } };
}
