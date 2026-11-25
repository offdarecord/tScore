/**
 * The image types the reader works on: plain RGBA pixels (a canvas ImageData, a video frame
 * drawn to a canvas, or a decoded file in Node), and a grey version of it.
 */

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row by row. */
  readonly data: Uint8ClampedArray | Uint8Array;
}

/** One brightness value per pixel, 0 (black) to 255 (white). */
export interface GreyImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Brightness (Rec. 601 luma). */
export function toGrey(img: RgbaImage): GreyImage {
  const out = new Uint8Array(img.width * img.height);
  const d = img.data;
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = ((d[p] ?? 0) * 299 + (d[p + 1] ?? 0) * 587 + (d[p + 2] ?? 0) * 114) / 1000;
  }
  return { width: img.width, height: img.height, data: out };
}

/** A smaller copy (box average), so finding the card is fast on a full camera frame. */
export function shrink(img: GreyImage, factor: number): GreyImage {
  if (factor <= 1) return img;
  const f = Math.floor(factor);
  const w = Math.floor(img.width / f);
  const h = Math.floor(img.height / f);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * img.width + x * f;
        for (let dx = 0; dx < f; dx++) sum += img.data[row + dx] ?? 0;
      }
      out[y * w + x] = sum / (f * f);
    }
  }
  return { width: w, height: h, data: out };
}

/** Brightness at a point, interpolated between pixels; outside the image reads as black. */
export function sample(img: GreyImage, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= img.width - 1 || y0 >= img.height - 1) return 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * img.width + x0;
  const d = img.data;
  const top = (d[i] ?? 0) * (1 - fx) + (d[i + 1] ?? 0) * fx;
  const bottom = (d[i + img.width] ?? 0) * (1 - fx) + (d[i + img.width + 1] ?? 0) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Otsu's threshold: the grey level that best splits dark from light. */
export function otsu(img: GreyImage): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of img.data) hist[v] = (hist[v] ?? 0) + 1;
  const total = img.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (hist[i] ?? 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}
