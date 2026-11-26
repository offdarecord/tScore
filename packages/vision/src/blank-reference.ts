/**
 * What each cell of a card looks like blank (#104), so a cell is read as change from its blank
 * self instead of plain darkness. The printed digit, ring or box is in the reference, so it
 * never counts as a mark; that makes ink readable, and small pen holes stand out.
 *
 * A reference holds, for each cell, the blank card's brightness at the points the reader
 * measures, on a 0–1 scale: 0 = as dark as the card's reference black, 1 = the card's paper.
 * Being relative to the paper, it suits any paper colour and lighting.
 *
 * Where a reference comes from:
 * - the regional card: drawn from its profile's own geometry ({@link drawnBlankReference}),
 *   the same printing the practice cards and test cards carry. Never a photo of a real card.
 * - other cards: from a blank card the desk shows the camera (the Teach a card wizard, #107)
 *   through {@link blankReferenceFrom}.
 * - none known: plain paper ({@link paperReference}), which measures darkness as before.
 */
import type { ReaderProfile } from './reader.js';

/** A point measured in a cell, in column widths from the cell's centre. */
export interface CellPoint {
  /** Up the card. */
  readonly du: number;
  /** Across the card, to the right. */
  readonly dv: number;
}

export interface BlankReference {
  /** The profile it was made for. */
  readonly profile: string;
  /** Where the reader measures in every cell. */
  readonly points: readonly CellPoint[];
  /**
   * Blank brightness (0 = black, 1 = paper) at each point, cell by cell:
   * index `(row * columns + column) * points.length + point`, row 0 = section 1.
   */
  readonly levels: Float32Array;
}

/** The points measured in a cell: a disc of the profile's cell radius, on a 7 × 7 grid. */
export function cellPoints(radius: number): CellPoint[] {
  const points: CellPoint[] = [];
  for (let du = -radius; du <= radius + 1e-9; du += radius / 3) {
    for (let dv = -radius; dv <= radius + 1e-9; dv += radius / 3) {
      if (du * du + dv * dv > radius * radius + 1e-9) continue;
      points.push({ du, dv });
    }
  }
  return points;
}

/** The centre of a cell, in column widths up from the grid's bottom and across from its column. */
export function cellCentre(
  profile: Pick<ReaderProfile, 'rows' | 'cellOffsets'>,
  pitch: number,
  section: number,
  column: number,
): { u: number; v: number } {
  return { u: (profile.rows - section + 0.5) * pitch, v: profile.cellOffsets[column] ?? 0 };
}

/**
 * A reference from any picture of a blank card: `blankAt(u, v)` gives its brightness (0 = black,
 * 1 = paper) at a point in column widths, u up from the grid's bottom, v across.
 */
export function blankReferenceFrom(
  profile: ReaderProfile,
  blankAt: (u: number, v: number) => number,
): BlankReference {
  const points = cellPoints(profile.cellRadius);
  const columns = profile.cellOffsets.length;
  const levels = new Float32Array(profile.rows * columns * points.length);
  for (let row = 0; row < profile.rows; row++) {
    for (let c = 0; c < columns; c++) {
      const { u, v } = cellCentre(profile, profile.pitch, row + 1, c);
      points.forEach((p, k) => {
        const level = blankAt(u + p.du, v + p.dv);
        levels[(row * columns + c) * points.length + k] = Math.min(1, Math.max(0, level));
      });
    }
  }
  return { profile: profile.id, points, levels };
}

/** Plain paper everywhere: reading against it measures darkness, as the reader always did. */
export function paperReference(profile: ReaderProfile): BlankReference {
  return blankReferenceFrom(profile, () => 1);
}

/** Grey levels of the regional card's printing, as drawn on test and practice cards. */
export const PRINT = { mat: 22, ink: 18, line: 90, ring: 105, glyph: 70, paper: 235 } as const;

/**
 * The regional card's printing around a value cell, as a grey level on paper of `paper`
 * brightness, or null where it's plain paper: a ring round the hole and the printed digit.
 * `dv`, `du` are column widths from the cell's centre.
 */
export function printedCell(dv: number, du: number): number | null {
  const r = Math.sqrt(dv * dv + du * du);
  if (Math.abs(r - 0.27) < 0.025) return PRINT.ring;
  if (Math.abs(dv) < 0.035 && Math.abs(du) < 0.12) return PRINT.glyph;
  return null;
}

/**
 * The regional card blank, drawn from its profile's geometry: each cell's ring and digit, the
 * row lines, and the section column. Smoothed over about a pixel, as a camera sees print.
 */
export function drawnBlankReference(profile: ReaderProfile): BlankReference {
  const span = PRINT.paper - PRINT.ink;
  const grey = (u: number, v: number): number => {
    for (let c = 0; c < profile.cellOffsets.length; c++) {
      const dv = v - (profile.cellOffsets[c] ?? 0);
      const row = Math.round(u / profile.pitch - 0.5);
      const du = u - (row + 0.5) * profile.pitch;
      if (Math.abs(dv) > 0.3 || Math.abs(du) > 0.3) continue;
      const g = printedCell(dv, du);
      if (g !== null) return g;
    }
    if (Math.abs(v) <= 0.5) return PRINT.ink;
    const j = Math.round(u / profile.pitch);
    if (Math.abs(u - j * profile.pitch) < 0.025) return PRINT.line;
    return PRINT.paper;
  };
  // Average a small neighbourhood (about a pixel at the smallest readable card).
  const blur = 0.02;
  return blankReferenceFrom(profile, (u, v) => {
    let sum = 0;
    for (const du of [-blur, 0, blur])
      for (const dv of [-blur, 0, blur]) sum += grey(u + du, v + dv);
    return (sum / 9 - PRINT.ink) / span;
  });
}

const references = new WeakMap<ReaderProfile, BlankReference>();

/**
 * The reference a profile reads against when none is given: the regional card is drawn from
 * its geometry; a card tScore hasn't been shown blank reads against plain paper.
 */
export function blankReferenceFor(profile: ReaderProfile): BlankReference {
  let ref = references.get(profile);
  if (!ref) {
    ref = profile.id === 'regional-16' ? drawnBlankReference(profile) : paperReference(profile);
    references.set(profile, ref);
  }
  return ref;
}
