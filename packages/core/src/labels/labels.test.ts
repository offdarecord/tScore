import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { EventSetup } from '../generated/event-setup.js';
import type { EntryInput } from '../results/model.js';
import { alignmentTestDocx, labelsDocx } from './docx.js';
import { planLabels, qrPayload, type CardLabel } from './plan.js';
import { qrMatrix, qrPng } from './qr.js';
import { labelTemplate, LABEL_TEMPLATES } from './templates.js';
import { fitName, textWidthMm } from './text.js';

// Invented riders only.
const setup = (days = 1): EventSetup => ({
  schema: 'tscore.event_setup/1',
  event: { name: 'Example Club Trial', code: 'DEMO1' },
  days: Array.from({ length: days }, (_, i) => ({ day: i + 1 })),
  classes: [
    { name: 'Trial 2', days: { '1': { sections: 10, laps: 4 }, '2': { sections: 10, laps: 4 } } },
    { name: 'Juniors', days: { '1': { sections: 10, laps: 3 } } },
    { name: 'Minder', scored: false, days: { '1': { sections: 10, laps: 4 } } },
  ],
});

const rider = (number: number, cls: string, extra: Partial<EntryInput> = {}): EntryInput => ({
  number,
  riders: [{ givenName: 'Avery', familyName: 'Stone' }],
  tier: 'competitive',
  status: 'riding',
  classes: [cls],
  ...extra,
});

const L7651 = labelTemplate('L7651');
const labels = (slots: readonly (CardLabel | null)[]) => slots.filter((s) => s !== null);

describe('planLabels', () => {
  it('gives each rider one label per lap their class rides', () => {
    const plan = planLabels(setup(), [rider(1, 'Trial 2'), rider(2, 'Juniors')], L7651);
    expect(plan.labels).toBe(7);
    expect(plan.riders).toBe(2);
    expect(plan.layout).toBe('row-per-rider');
    // One rider per row: rider 2 starts on the second row.
    expect(plan.slots.map((s) => s && `${s.number}/${s.lap}`)).toEqual([
      '1/1', '1/2', '1/3', '1/4', null, '2/1', '2/2', '2/3',
    ]); // prettier-ignore
    expect(plan.sheets).toBe(1);
  });

  it('skips minders, DNS riders and classes the setup lacks, and says why', () => {
    const plan = planLabels(
      setup(),
      [
        rider(1, 'Minder'),
        rider(2, 'Trial 2', { status: 'dns' }),
        rider(3, 'Trial 9'),
        rider(4, 'Trial 2'),
      ],
      L7651,
    );
    expect(plan.riders).toBe(1);
    expect(plan.skipped.map((s) => `${s.number}:${s.reason}`)).toEqual([
      '1:not_scored',
      '2:dns',
      '3:unknown_class',
    ]);
  });

  it('labels each day at a two-day event, and only the days a class rides', () => {
    const plan = planLabels(setup(2), [rider(1, 'Trial 2'), rider(2, 'Juniors')], L7651);
    expect(plan.labels).toBe(8 + 3);
    const first = labels(plan.slots)[0];
    expect(first?.lapText.text).toBe('D1·LAP 1');
    expect(labels(plan.slots).filter((s) => s.number === 2 && s.day === 2)).toHaveLength(0);
  });

  it('groups by lap, packs, and starts part-way into a sheet', () => {
    const riders = [rider(1, 'Trial 2'), rider(2, 'Juniors')];
    const byLap = planLabels(setup(), riders, L7651, { layout: 'by-lap' });
    expect(byLap.slots.map((s) => s && `${s.number}/${s.lap}`)).toEqual([
      '1/1', '2/1', '1/2', '2/2', '1/3', '2/3', '1/4',
    ]); // prettier-ignore
    const packed = planLabels(setup(), riders, L7651, { layout: 'packed', start: 3 });
    expect(packed.slots.slice(0, 3)).toEqual([null, null, expect.anything()]);
    expect(packed.slots).toHaveLength(2 + 7);
  });

  it('packs automatically when a class rides more laps than labels across a sheet', () => {
    const s = setup();
    const six: EventSetup = {
      ...s,
      classes: [{ name: 'Trial 2', days: { '1': { sections: 10, laps: 6 } } }],
    };
    expect(planLabels(six, [rider(1, 'Trial 2')], L7651).layout).toBe('packed');
  });

  it('prints only the chosen riders and day', () => {
    const plan = planLabels(setup(2), [rider(1, 'Trial 2'), rider(2, 'Trial 2')], L7651, {
      riders: [2],
      day: 2,
    });
    expect(labels(plan.slots).map((s) => `${s.number}/${s.day}/${s.lap}`)).toEqual([
      '2/2/1', '2/2/2', '2/2/3', '2/2/4',
    ]); // prettier-ignore
  });

  it('marks NC and No award riders, and puts the scan code in the QR', () => {
    const plan = planLabels(
      setup(),
      [rider(5, 'Trial 2', { tier: 'non_competitive' }), rider(6, 'Trial 2', { tier: 'no_award' })],
      L7651,
    );
    const all = labels(plan.slots);
    expect(all[0]?.classText.text).toBe('Trial 2 · NC');
    expect(all[4]?.classText.text).toBe('Trial 2 · NA');
    expect(all[0]?.qr).toBe('TS1;E=DEMO1;R=5;D=1;L=1');
  });
});

describe('fitName', () => {
  const width = 21.7;
  it('keeps a name that fits', () => {
    expect(fitName('Avery', 'Stone', width)).toEqual({ text: 'Avery Stone', pt: 6.5 });
  });
  it('shortens a long name to F. SURNAME, then shrinks, then cuts it short', () => {
    expect(fitName('Maximilian', 'Worthington', width).text).toBe('M. WORTHINGTON');
    const longer = fitName('Alexandra', 'Featherstonehaugh-Worthington', width);
    expect(longer.pt).toBe(5.5);
    expect(longer.text.endsWith('…')).toBe(true);
    expect(textWidthMm(longer.text, longer.pt)).toBeLessThanOrEqual(width);
  });
});

describe('QR codes', () => {
  it('encodes the payload at medium error correction in a small code', () => {
    const grid = qrMatrix(qrPayload('DEMO1', 123, 2, 4));
    expect(grid.length).toBe(25); // version 2: about 0.5 mm per module at 13 mm
  });
  it('writes a PNG', () => {
    const png = qrPng('TS1;E=DEMO1;R=1;D=1;L=1');
    expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});

describe('labelsDocx', () => {
  const plan = planLabels(
    setup(),
    Array.from({ length: 20 }, (_, i) =>
      rider(i + 1, i % 3 ? 'Trial 2' : 'Juniors', {
        riders: [{ givenName: i === 4 ? 'Maximilian' : 'Avery', familyName: `Stone & Co ${i}` }],
      }),
    ),
    L7651,
  );

  it('writes a Word document with one table per sheet and a QR image per label', () => {
    const files = unzipSync(labelsDocx(plan.slots, L7651, { code: 'DEMO1' }));
    const doc = strFromU8(files['word/document.xml'] ?? new Uint8Array());
    expect(doc.match(/<w:tbl>/g)).toHaveLength(plan.sheets);
    expect(Object.keys(files).filter((f) => f.startsWith('word/media/'))).toHaveLength(plan.labels);
    expect(doc).toContain('Stone &amp; Co 1');
    // Page margins put the first label at the template's position (10.7 mm, 4.7 mm).
    expect(doc).toContain('w:top="607"');
    expect(doc).toContain('w:left="266"');
  });

  it('moves everything by the printer offset', () => {
    const doc = strFromU8(
      unzipSync(labelsDocx(plan.slots, L7651, { code: 'DEMO1', offsetXmm: 1, offsetYmm: -0.5 }))[
        'word/document.xml'
      ] ?? new Uint8Array(),
    );
    expect(doc).toContain(`w:top="${Math.round(10.2 * 56.6929)}"`);
    expect(doc).toContain(`w:left="${Math.round(5.7 * 56.6929)}"`);
  });

  it('writes an alignment test page with every position outlined', () => {
    const doc = strFromU8(
      unzipSync(alignmentTestDocx(L7651, { code: 'DEMO1' }))['word/document.xml'] ??
        new Uint8Array(),
    );
    expect(doc).toContain('w:val="dotted"');
    expect(doc).toContain('>65<');
  });

  it('is the same file every time', () => {
    expect(labelsDocx(plan.slots, L7651, { code: 'DEMO1' })).toEqual(
      labelsDocx(plan.slots, L7651, { code: 'DEMO1' }),
    );
  });
});

it('ships a valid default template', () => {
  expect(LABEL_TEMPLATES.map((t) => t.id)).toContain('L7651');
  expect(labelTemplate(undefined).id).toBe('L7651');
});

it('leaves out labels already printed: late entries and added laps', () => {
  const riders = [rider(1, 'Trial 2'), rider(2, 'Trial 2')];
  const printed = new Set(['1/1/1', '1/1/2', '1/1/3']);
  const plan = planLabels(setup(), riders, L7651, { exclude: printed });
  expect(plan.slots.map((s) => s && `${s.number}/${s.lap}`)).toEqual([
    '1/4', null, null, null, null, '2/1', '2/2', '2/3', '2/4',
  ]); // prettier-ignore
  expect(plan.riders).toBe(2);
  expect(
    planLabels(setup(), [rider(1, 'Trial 2')], L7651, { exclude: new Set([...printed, '1/1/4']) })
      .labels,
  ).toBe(0);
});
