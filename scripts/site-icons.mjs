// The website's icons (#116), made from the app icon at build time so the site and the app always
// match: favicon.ico is the app's own .ico; the PNGs are resized from icon.png. Uses only Node's
// zlib (the Pages build installs no packages). The icon is all rights reserved (assets/LICENSE).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

/** Decode an 8-bit RGBA, non-interlaced PNG (what the app icon is) to its pixels. */
export function readPng(file) {
  const buf = readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error(`${file}: expected an 8-bit RGBA, non-interlaced PNG`);
      }
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { width, height, px };
}

/**
 * Shrink by averaging the source pixels under each target pixel (alpha-weighted, so transparent
 * edges don't go dark). With `background`, the result is flattened onto that colour.
 */
export function shrink(img, size, background) {
  const out = Buffer.alloc(size * size * 4);
  const scale = img.width / size;
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const x0 = tx * scale;
      const y0 = ty * scale;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = Math.floor(y0); sy < Math.min(img.height, Math.ceil(y0 + scale)); sy++) {
        const wy = Math.min(sy + 1, y0 + scale) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.min(img.width, Math.ceil(x0 + scale)); sx++) {
          const w = wy * (Math.min(sx + 1, x0 + scale) - Math.max(sx, x0));
          const i = (sy * img.width + sx) * 4;
          const alpha = (img.px[i + 3] / 255) * w;
          r += img.px[i] * alpha;
          g += img.px[i + 1] * alpha;
          b += img.px[i + 2] * alpha;
          a += alpha;
          n += w;
        }
      }
      const o = (ty * size + tx) * 4;
      const coverage = a / n;
      const colour = (sum, i) =>
        (a > 0 ? sum / a : 0) * (background ? coverage : 1) +
        (background ? background[i] * (1 - coverage) : 0);
      out[o] = Math.round(colour(r, 0));
      out[o + 1] = Math.round(colour(g, 1));
      out[o + 2] = Math.round(colour(b, 2));
      out[o + 3] = background ? 255 : Math.round(coverage * 255);
    }
  }
  return { width: size, height: size, px: out };
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Encode RGBA pixels as a PNG. */
export function pngOf(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    img.px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Write the site's icons into `out`: favicon.ico, icon-32.png and apple-touch-icon.png. */
export function writeSiteIcons(root, out) {
  const build = join(root, 'apps/desktop/build');
  writeFileSync(join(out, 'favicon.ico'), readFileSync(join(build, 'icon.ico')));
  const icon = readPng(join(build, 'icon.png'));
  writeFileSync(join(out, 'icon-32.png'), pngOf(shrink(icon, 32)));
  // iOS shows transparency as black on the home screen, so this one is on white.
  writeFileSync(join(out, 'apple-touch-icon.png'), pngOf(shrink(icon, 180, [255, 255, 255])));
}
