// Builds the Test trial kit (#81): a zip to rehearse the whole day at home, attached to every
// GitHub Release. Invented riders only.
//
//   node scripts/build-test-trial.mjs [out-dir]     (default: dist-kit/)
//
// The kit: an Entryplace-style entry list, printable practice cards (true size, 43 × 145 mm)
// with what to punch on each, the answer key the app checks against, and the instructions.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { createJiti } from 'jiti';
import * as XLSX from 'xlsx';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(import.meta.url);
const core = await jiti.import(join(root, 'packages/core/src/test-trial.ts'));
const { TEST_TRIAL_EVENT, TEST_TRIAL_RIDERS, PRACTICE_CARD_MM, testTrialKey } = core;
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const out = resolve(process.argv[2] ?? join(root, 'dist-kit'));
const name = `tScore-Test-Trial-${version}`;
const dir = join(out, name);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const key = { ...testTrialKey(), tscoreVersion: version };

// ---- Entry list, as Entryplace exports it ----
const GRADE = {
  'Trial 2': 'Trial 2 (A Grade)',
  'Trial 3': 'Trial 3 (B Grade)',
  'Trial 4': 'Trial 4 (C Grade)',
};
const sheet = XLSX.utils.aoa_to_sheet([
  [
    'Entry Form Reference',
    'First Name',
    'Last Name',
    'Class',
    'Club',
    'Competitive',
    'Entry Group',
    'Machine',
  ],
  ...TEST_TRIAL_RIDERS.map((r, i) => [
    `TEST-${String(i + 1).padStart(3, '0')}`,
    r.givenName,
    r.familyName,
    GRADE[r.className] ?? r.className,
    r.club,
    'Y',
    'Solo',
    'Practice 250',
  ]),
]);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, 'Entry List');
const entryList = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });

// ---- Practice cards PDF: vector, so it prints sharp at 100% ----
const MM = 72 / 25.4;
const A4 = { w: 210, h: 297 };
const C = PRACTICE_CARD_MM;
const U = C.unit;
const ROWS = 16;
const PITCH = 0.675;
const VALUES = [0, 1, 2, 3, 5];
const OFFSETS = [-1.53, -1.01, 0.99, 1.52, 2.02];
const RING_R = 0.27;
const PER_PAGE = 4;
const GAP = 4;

const f = (n) => (Math.round(n * 1000) / 1000).toString();
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** PDF drawing in millimetres from the page's bottom-left. */
class Page {
  ops = [];
  grey(g) {
    this.ops.push(`${f(g)} g ${f(g)} G`);
  }
  width(mm) {
    this.ops.push(`${f(mm * MM)} w`);
  }
  rect(x, y, w, h, mode = 'S') {
    this.ops.push(`${f(x * MM)} ${f(y * MM)} ${f(w * MM)} ${f(h * MM)} re ${mode}`);
  }
  line(x1, y1, x2, y2) {
    this.ops.push(`${f(x1 * MM)} ${f(y1 * MM)} m ${f(x2 * MM)} ${f(y2 * MM)} l S`);
  }
  dash(on) {
    this.ops.push(on ? '[2 2] 0 d' : '[] 0 d');
  }
  circle(cx, cy, r, mode = 'S') {
    const k = 0.5523 * r;
    const p = (x, y) => `${f(x * MM)} ${f(y * MM)}`;
    this.ops.push(
      `${p(cx + r, cy)} m ${p(cx + r, cy + k)} ${p(cx + k, cy + r)} ${p(cx, cy + r)} c ` +
        `${p(cx - k, cy + r)} ${p(cx - r, cy + k)} ${p(cx - r, cy)} c ` +
        `${p(cx - r, cy - k)} ${p(cx - k, cy - r)} ${p(cx, cy - r)} c ` +
        `${p(cx + k, cy - r)} ${p(cx + r, cy - k)} ${p(cx + r, cy)} c ${mode}`,
    );
  }
  /** Text; `align` centre or left; `bold` uses Helvetica-Bold. */
  text(x, y, size, s, { align = 'left', bold = false } = {}) {
    const width = s.length * size * 0.5 * (1 / MM); // rough, for centring short labels
    const tx = align === 'centre' ? x - width / 2 : x;
    this.ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${f(size)} Tf ${f(tx * MM)} ${f(y * MM)} Td (${esc(s)}) Tj ET`,
    );
  }
}

/** One practice card with its bottom-left corner at (x, y). */
function drawCard(p, x, y, card) {
  const cx = x + C.columnX;
  const gridBottom = y + C.gridBottom;
  const gridTop = gridBottom + (ROWS + 1) * PITCH * U;
  // Outline (cut line).
  p.grey(0);
  p.width(0.2);
  p.rect(x, y, C.width, C.height);
  // Black section column, header cell included, with white section numbers.
  p.rect(cx - 0.5 * U, gridBottom, U, gridTop - gridBottom, 'f');
  p.grey(1);
  for (let s = 1; s <= ROWS; s++) {
    const uc = gridBottom + (ROWS - s + 0.5) * PITCH * U;
    p.text(cx, uc - 1.1, 7, String(s), { align: 'centre', bold: true });
  }
  p.text(cx, gridBottom + (ROWS + 0.5) * PITCH * U - 0.9, 4.6, 'SECTN', {
    align: 'centre',
    bold: true,
  });
  // Row lines across the card.
  p.grey(0.35);
  p.width(0.15);
  for (let j = 0; j <= ROWS + 1; j++) {
    const ly = gridBottom + j * PITCH * U;
    p.line(x + 0.5, ly, x + C.width - 0.5, ly);
  }
  // Value headings above the grid and a ring, with its value, for every cell.
  p.grey(0.2);
  VALUES.forEach((v, i) => {
    p.text(cx + OFFSETS[i] * U, gridBottom + (ROWS + 0.5) * PITCH * U - 1.2, 7, String(v), {
      align: 'centre',
      bold: true,
    });
  });
  for (let s = 1; s <= ROWS; s++) {
    const uc = gridBottom + (ROWS - s + 0.5) * PITCH * U;
    VALUES.forEach((v, i) => {
      const vx = cx + OFFSETS[i] * U;
      p.grey(0.45);
      p.width(0.2);
      p.circle(vx, uc, RING_R * U);
      p.grey(0.65);
      p.text(vx, uc - 0.9, 4.5, String(v), { align: 'centre' });
    });
  }
  // Total box under the grid.
  p.grey(0.35);
  p.width(0.2);
  p.rect(x + 3, y + 2.5, C.width - 6, C.gridBottom - 4.5);
  p.grey(0.3);
  p.text(x + 4.5, y + 5.2, 6, 'TOTAL');
  // Label area: the rider's lap label goes here.
  const top = y + C.height;
  p.grey(0.55);
  p.dash(true);
  p.rect(x + (C.width - 38.1) / 2, top - 22.4, 38.1, 21.2);
  p.dash(false);
  p.grey(0.45);
  p.text(x + C.width / 2, top - 10, 5.5, `Card ${card.card}: stick the label here`, {
    align: 'centre',
  });
  p.text(x + C.width / 2, top - 14, 5.5, `${card.givenName} ${card.familyName}, lap ${card.lap}`, {
    align: 'centre',
  });
  p.text(x + C.width / 2, top - 18, 4.8, 'TEST TRIAL practice card', { align: 'centre' });
}

const pages = [];
for (let start = 0; start < key.cards.length; start += PER_PAGE) {
  const cards = key.cards.slice(start, start + PER_PAGE);
  const p = new Page();
  const left = (A4.w - (PER_PAGE * C.width + (PER_PAGE - 1) * GAP)) / 2;
  const bottom = A4.h - 8 - C.height;
  cards.forEach((card, i) => drawCard(p, left + i * (C.width + GAP), bottom, card));
  // What to punch on these cards.
  p.grey(0);
  let y = bottom - 9;
  p.text(
    left,
    y,
    11,
    `TEST TRIAL: what to punch on cards ${cards[0].card} to ${cards.at(-1).card}`,
    { bold: true },
  );
  y -= 6;
  p.text(
    left,
    y,
    8.5,
    "Punch the hole (or fill the circle with a black marker) for each section's score.",
  );
  y -= 9;
  for (const card of cards) {
    p.text(
      left,
      y,
      10,
      `Card ${card.card}: ${card.givenName} ${card.familyName}, lap ${card.lap}`,
      { bold: true },
    );
    y -= 5.5;
    p.text(left + 4, y, 10, card.scores.map((s, i) => `S${i + 1}: ${s}`).join('     '));
    y -= 9;
  }
  // Scale check.
  y -= 2;
  p.grey(0);
  p.width(0.4);
  p.line(left, y, left + 100, y);
  p.line(left, y - 1.5, left, y + 1.5);
  p.line(left + 100, y - 1.5, left + 100, y + 1.5);
  p.text(
    left,
    y - 6,
    8.5,
    'Print at 100% (actual size): this line should measure 100 mm, and each card 43 x 145 mm.',
  );
  pages.push(p.ops.join('\n'));
}

function pdf(contents) {
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;
  const catalog = add('');
  const pagesId = add('');
  const f1 = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const f2 = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );
  const kids = contents.map((c) => {
    const stream = add(`<< /Length ${Buffer.byteLength(c, 'latin1')} >>\nstream\n${c}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f(A4.w * MM)} ${f(A4.h * MM)}] ` +
        `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${stream} 0 R >>`,
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info << /Title (tScore Test trial practice cards) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
const cardsPdf = pdf(pages);

// ---- Instructions ----
const instructions = readFileSync(join(root, 'scripts/test-trial/instructions.html'), 'utf8')
  .replaceAll('{{VERSION}}', version)
  .replaceAll('{{EVENT_NAME}}', TEST_TRIAL_EVENT.name)
  .replaceAll('{{EVENT_CODE}}', TEST_TRIAL_EVENT.code)
  .replaceAll('{{SECTIONS}}', String(TEST_TRIAL_EVENT.sections))
  .replaceAll('{{LAPS}}', String(TEST_TRIAL_EVENT.laps))
  .replaceAll('{{CARDS}}', String(key.cards.length))
  .replaceAll('{{RIDERS}}', String(TEST_TRIAL_RIDERS.length));

const files = {
  'README - start here.html': strToU8(instructions),
  'entry-list.xlsx': new Uint8Array(entryList),
  'practice-cards.pdf': new Uint8Array(cardsPdf),
  'answer-key.json': strToU8(`${JSON.stringify(key, null, 2)}\n`),
};
for (const [file, data] of Object.entries(files)) writeFileSync(join(dir, file), data);
const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [`${name}/${k}`, v])));
writeFileSync(join(out, `${name}.zip`), zip);
console.log(`Built ${join(out, `${name}.zip`)} (${key.cards.length} cards, ${pages.length} pages)`);
