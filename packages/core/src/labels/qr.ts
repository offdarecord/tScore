/** QR codes for card labels: the module grid, and a PNG of it for the Word document. */
import { zlibSync } from 'fflate';
import qrcode from 'qrcode-generator';

/** The QR code for `payload` as rows of dark (true) and light modules, without a quiet zone. */
export function qrMatrix(payload: string): boolean[][] {
  // Medium error correction (architecture §7): survives some mud and creases.
  const qr = qrcode(0, 'M');
  qr.addData(payload, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * A black-and-white PNG of the QR code, `scale` pixels per module, with a one-module light
 * border (the label's white space supplies the rest of the quiet zone).
 */
export function qrPng(payload: string, scale = 8): Uint8Array {
  const grid = qrMatrix(payload);
  const border = 1;
  const modules = grid.length + border * 2;
  const size = modules * scale;
  // 8-bit greyscale rows, each with a leading filter byte (0 = none).
  const raw = new Uint8Array(size * (size + 1));
  for (let y = 0; y < size; y++) {
    const row = grid[Math.floor(y / scale) - border];
    raw[y * (size + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dark = row?.[Math.floor(x / scale) - border] ?? false;
      raw[y * (size + 1) + 1 + x] = dark ? 0 : 255;
    }
  }
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, size);
  hv.setUint32(4, size);
  header.set([8, 0, 0, 0, 0], 8); // bit depth 8, greyscale, deflate, no filter, no interlace
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}
