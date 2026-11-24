/**
 * Card labels in the main process (architecture §8.1): planned from the event as saved, saved
 * as a Word document where the desk chooses, and remembered as printed so late entries and
 * added laps can be printed on their own.
 *
 * The printer offset belongs to this laptop (its printer), not the event, so it lives in the
 * app's settings folder.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  alignmentTestDocx,
  labelKey,
  labelsDocx,
  labelTemplate,
  planLabels,
  qrMatrix,
  type LabelLayoutChoice,
  type LabelOptions,
} from '@tscore/core';
import { StoreError, type EventStore } from '@tscore/store';
import { app, dialog, type BrowserWindow } from 'electron';
import type { LabelOffset, LabelPreview, LabelRequest, LabelsView } from '../shared/ipc';
import { rememberExport } from './results';

const LAYOUTS: readonly LabelLayoutChoice[] = ['auto', 'row-per-rider', 'packed', 'by-lap'];
/** Furthest the desk can nudge the labels, in mm: beyond this the sheet is the wrong stock. */
const MAX_OFFSET = 5;

const offsetFile = () => join(app.getPath('userData'), 'label-printer.json');

export function labelOffset(): LabelOffset {
  try {
    const data = JSON.parse(readFileSync(offsetFile(), 'utf8')) as Partial<LabelOffset>;
    const ok = (v: unknown) => typeof v === 'number' && Math.abs(v) <= MAX_OFFSET;
    return { x: ok(data.x) ? Number(data.x) : 0, y: ok(data.y) ? Number(data.y) : 0 };
  } catch {
    return { x: 0, y: 0 };
  }
}

export function setLabelOffset(offset: LabelOffset): LabelOffset {
  const tidy = (v: unknown) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > MAX_OFFSET) {
      throw new StoreError(
        'APP_BAD_REQUEST',
        `Printer offsets are between −${MAX_OFFSET} and +${MAX_OFFSET} mm.`,
      );
    }
    return Math.round(v * 10) / 10;
  };
  const tidied = { x: tidy(offset?.x), y: tidy(offset?.y) };
  writeFileSync(offsetFile(), JSON.stringify(tidied), 'utf8');
  return tidied;
}

/** Check a request from the window before using it. */
function checkRequest(request: LabelRequest): LabelRequest {
  const r = request as Partial<LabelRequest> | null;
  const whole = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1;
  if (
    !r ||
    !LAYOUTS.includes(r.layout as LabelLayoutChoice) ||
    !whole(r.start) ||
    typeof r.qr !== 'boolean' ||
    typeof r.minders !== 'boolean' ||
    !(r.which === 'all' || r.which === 'unprinted' || (r.which && whole(r.which.rider)))
  ) {
    throw new StoreError('APP_BAD_REQUEST', 'Those label settings are incomplete.');
  }
  return r as LabelRequest;
}

function plan(store: EventStore, request: LabelRequest) {
  const setup = store.setup;
  const template = labelTemplate(setup.labels?.template);
  const options: LabelOptions = {
    layout: request.layout,
    start: request.start,
    qr: request.qr,
    includeNotScored: request.minders,
    ...(request.which === 'unprinted' && {
      exclude: new Set(store.printedLabels().map((l) => labelKey(l.number, l.day, l.lap))),
    }),
    ...(typeof request.which === 'object' && { riders: [request.which.rider] }),
  };
  if (typeof request.which === 'object') store.entry(request.which.rider); // must exist
  return { template, plan: planLabels(setup, store.entries(), template, options) };
}

export function labelsView(store: EventStore, request: LabelRequest): LabelsView {
  const checked = checkRequest(request);
  const { template, plan: p } = plan(store, checked);
  const everything = planLabels(store.setup, store.entries(), template, {
    qr: checked.qr,
    includeNotScored: checked.minders,
  });
  const printed = new Set(store.printedLabels().map((l) => labelKey(l.number, l.day, l.lap)));
  const notPrinted = everything.slots.filter(
    (s) => s !== null && !printed.has(labelKey(s.number, s.day, s.lap)),
  ).length;
  const names = new Map(
    store.entries().map((e) => {
      const r = e.riders[0];
      return [e.number, r ? `${r.givenName} ${r.familyName}`.trim() : ''];
    }),
  );
  const perSheet = template.columns * template.rows;
  const firstSheet: (LabelPreview | null)[] = p.slots.slice(0, perSheet).map((s) =>
    s
      ? {
          number: s.number,
          day: s.day,
          lap: s.lap,
          lapText: s.lapText.text,
          name: s.name.text,
          small: s.name.pt < 6.5,
          classText: s.classText.text,
          qr: checked.qr
            ? qrMatrix(s.qr).map((row) => row.map((d) => (d ? '1' : '0')).join(''))
            : [],
        }
      : null,
  );
  return {
    template: { id: template.id, name: template.name, columns: template.columns, perSheet },
    layout: p.layout,
    labels: p.labels,
    riders: p.riders,
    sheets: p.sheets,
    firstSheet,
    skipped: p.skipped.map((s) => ({ ...s, name: names.get(s.number) ?? '' })),
    printed: printed.size,
    notPrinted,
    days: store.setup.days.length,
    offset: labelOffset(),
  };
}

const safe = (name: string) => name.replace(/[<>:"/\\|?*]/g, '');

async function saveAs(
  win: BrowserWindow | null,
  title: string,
  defaultPath: string,
): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    title,
    defaultPath,
    filters: [{ name: 'Word document', extensions: ['docx'] }],
  };
  const picked = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  return picked.canceled || !picked.filePath ? null : picked.filePath;
}

/** Ask where to save, then write the labels and record them as printed. */
export async function saveLabels(
  store: EventStore,
  request: LabelRequest,
  win: BrowserWindow | null,
): Promise<{ path: string; labels: number } | null> {
  const checked = checkRequest(request);
  const { template, plan: p } = plan(store, checked);
  if (p.labels === 0) {
    throw new StoreError('APP_NO_LABELS', 'There are no labels to print with these settings.');
  }
  const code = store.setup.event.code;
  const what =
    checked.which === 'all'
      ? 'card labels'
      : checked.which === 'unprinted'
        ? 'card labels not yet printed'
        : `card labels rider ${checked.which.rider}`;
  const path = await saveAs(
    win,
    'Save card labels',
    join(store.folder, 'exports', safe(`${code} ${what}.docx`)),
  );
  if (!path) return null;
  const offset = labelOffset();
  writeFileSync(
    path,
    labelsDocx(p.slots, template, {
      code,
      qr: checked.qr,
      offsetXmm: offset.x,
      offsetYmm: offset.y,
    }),
  );
  const keys = p.slots.flatMap((s) => (s ? [{ number: s.number, day: s.day, lap: s.lap }] : []));
  store.recordLabelsPrinted(
    keys,
    typeof checked.which === 'object' ? `rider ${checked.which.rider}` : checked.which,
  );
  rememberExport(path);
  return { path, labels: keys.length };
}

/** Ask where to save, then write the plain-paper alignment test page. */
export async function saveLabelTestPage(
  store: EventStore,
  win: BrowserWindow | null,
): Promise<string | null> {
  const template = labelTemplate(store.setup.labels?.template);
  const path = await saveAs(
    win,
    'Save the alignment test page',
    join(store.folder, 'exports', safe(`label alignment test ${template.id}.docx`)),
  );
  if (!path) return null;
  const offset = labelOffset();
  writeFileSync(
    path,
    alignmentTestDocx(template, {
      code: store.setup.event.code,
      offsetXmm: offset.x,
      offsetYmm: offset.y,
    }),
  );
  rememberExport(path);
  return path;
}
