/**
 * The rider label's QR code (card labels, architecture §8.1): `TS1;E=<event code>;R=<number>;
 * D=<day>;L=<lap>`. It gives identity only; the grid comes from the card itself, because labels
 * are stuck on by hand a few millimetres differently every time.
 */
import jsQR from 'jsqr';
import type { RgbaImage } from './image.js';
import type { CardPose } from './reader.js';

export interface LabelId {
  readonly event: string;
  readonly number: number;
  readonly day: number;
  readonly lap: number;
}

/** Parse a label's QR text, or null if it isn't one of ours. */
export function parseLabel(text: string): LabelId | null {
  const m = /^TS1;E=([A-Z0-9][A-Z0-9-]{0,15});R=(\d{1,5});D=(\d{1,2});L=(\d{1,2})$/.exec(
    text.trim(),
  );
  if (!m) return null;
  return { event: m[1] ?? '', number: Number(m[2]), day: Number(m[3]), lap: Number(m[4]) };
}

/**
 * Look for the label's QR in the card's header area (above the column), or anywhere in the
 * frame if no pose is given. Null if there isn't a readable tScore label.
 */
export function readLabel(frame: RgbaImage, pose?: CardPose): LabelId | null {
  let x0 = 0;
  let y0 = 0;
  let x1 = frame.width;
  let y1 = frame.height;
  if (pose) {
    // The header: from the top of the column up about 5 column widths, the card's full width.
    const top = {
      x: pose.bottom.x + pose.up.x * pose.length,
      y: pose.bottom.y + pose.up.y * pose.length,
    };
    const corners = [-2.4, 2.9].flatMap((v) =>
      [-1, 5.5].map((u) => ({
        x: top.x + (pose.up.x * u + pose.right.x * v) * pose.width,
        y: top.y + (pose.up.y * u + pose.right.y * v) * pose.width,
      })),
    );
    x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))));
    y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))));
    x1 = Math.min(frame.width, Math.ceil(Math.max(...corners.map((c) => c.x))));
    y1 = Math.min(frame.height, Math.ceil(Math.max(...corners.map((c) => c.y))));
    if (x1 - x0 < 20 || y1 - y0 < 20) return null;
  }
  const w = x1 - x0;
  const h = y1 - y0;
  const crop = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * frame.width + x0) * 4;
    crop.set(frame.data.subarray(from, from + w * 4), y * w * 4);
  }
  const found = jsQR(crop, w, h, { inversionAttempts: 'dontInvert' });
  return found ? parseLabel(found.data) : null;
}
