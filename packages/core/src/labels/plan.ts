/**
 * Which card labels to print, and in what order on the sheets (architecture §8.1, decisions
 * 26 and 27). One label per rider, per day, per lap that the rider's class rides; nothing is
 * typed in separately.
 */
import type { EventSetup } from '../generated/event-setup.js';
import type { LabelTemplate } from '../generated/label-template.js';
import type { EntryInput, CompetitionStatus } from '../results/model.js';
import { cutToFit, fitName, textWidthMm, type FittedText } from './text.js';

export type LabelLayout = 'row-per-rider' | 'packed' | 'by-lap';
export type LabelLayoutChoice = LabelLayout | 'auto';

/** Width of the QR code's column on a label, and the code itself, in mm. */
export const QR_COLUMN_MM = 15;
export const QR_SIZE_MM = 13;
/** Space between the text and the edges of its cell, in mm. */
export const TEXT_PAD_LEFT_MM = 0.8;
export const TEXT_PAD_RIGHT_MM = 0.6;

/** Type sizes in points (architecture §7: the number 17 pt bold). */
export const NUMBER_PT = 17;
export const LAP_PT = [8.5, 7, 6] as const;
export const CLASS_PT = 6;

/** One printed label. */
export interface CardLabel {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  /** "LAP 3", or "D2·LAP 3" at a multi-day event. */
  readonly lapText: FittedText;
  readonly name: FittedText;
  /** The class, with "· NC" or "· NA" for non-competitive and No award riders. */
  readonly classText: FittedText;
  /** What the QR code holds (architecture §7): `TS1;E=code;R=number;D=day;L=lap`. */
  readonly qr: string;
}

/** A position on the sheet: a label, or left blank. */
export type LabelSlot = CardLabel | null;

export interface LabelOptions {
  readonly layout?: LabelLayoutChoice;
  /** First position to use on the first sheet, from 1 (uses up a started sheet). */
  readonly start?: number;
  /** Only these riders (late entries, reprints). Omit for everyone. */
  readonly riders?: readonly number[];
  /** Only this day. Omit for every day. */
  readonly day?: number;
  /** Leave room for the QR code (default true). */
  readonly qr?: boolean;
  /**
   * Print labels for riders in classes that aren't scored (minders) too, for the laps their
   * class has in the setup. Off by default: minders are left out.
   */
  readonly includeNotScored?: boolean;
  /**
   * Labels to leave out because they're already printed (keys from `labelKey`): what's left
   * is late entries' labels and laps added since.
   */
  readonly exclude?: ReadonlySet<string>;
}

/** Identifies one label: a rider's card for one lap of one day. */
export function labelKey(number: number, day: number, lap: number): string {
  return `${number}/${day}/${lap}`;
}

/** A rider who gets no labels, and why. */
export interface LabelSkip {
  readonly number: number;
  readonly reason: 'not_scored' | 'dns' | 'no_laps' | 'unknown_class';
  readonly className: string;
}

export interface LabelPlan {
  readonly layout: LabelLayout;
  readonly slots: readonly LabelSlot[];
  /** Labels to print (slots that aren't blank). */
  readonly labels: number;
  /** Riders with at least one label. */
  readonly riders: number;
  readonly sheets: number;
  readonly skipped: readonly LabelSkip[];
}

const COMPETITION_STATUS_MARK: Record<CompetitionStatus, string> = {
  competitive: '',
  no_award: 'NA',
  non_competitive: 'NC',
};

export function qrPayload(code: string, number: number, day: number, lap: number): string {
  return `TS1;E=${code};R=${number};D=${day};L=${lap}`;
}

/** Laps a class rides on a day (0 when it doesn't ride that day). */
export function lapsFor(setup: EventSetup, className: string, day: number): number {
  const cls = setup.classes.find((c) => c.name === className);
  return cls?.days[String(day)]?.laps ?? 0;
}

/** Width available for text on a label, in mm. */
export function textWidth(template: LabelTemplate, qr: boolean): number {
  return template.label.width_mm - (qr ? QR_COLUMN_MM : 0) - TEXT_PAD_LEFT_MM - TEXT_PAD_RIGHT_MM;
}

/** The lap marker, as large as fits beside the rider number. */
function fitLap(text: string, number: number, widthMm: number): FittedText {
  const room = widthMm - textWidthMm(`${number}  `, NUMBER_PT, true);
  for (const pt of LAP_PT) {
    if (textWidthMm(text, pt, true) <= room) return { text, pt };
  }
  return { text, pt: LAP_PT[LAP_PT.length - 1] ?? 6 };
}

interface Rider {
  readonly entry: EntryInput;
  readonly className: string;
}

/** Plan the labels for an event: what's printed, in which positions, on how many sheets. */
export function planLabels(
  setup: EventSetup,
  entries: readonly EntryInput[],
  template: LabelTemplate,
  options: LabelOptions = {},
): LabelPlan {
  const qr = options.qr ?? setup.labels?.qr ?? true;
  const width = textWidth(template, qr);
  const dayCount = setup.days.length;
  const days = setup.days
    .map((d) => d.day)
    .filter((d) => options.day === undefined || d === options.day);
  const only = options.riders ? new Set(options.riders) : undefined;
  const perSheet = template.columns * template.rows;
  const start = Math.min(Math.max(Math.trunc(options.start ?? 1), 1), perSheet);

  const skipped: LabelSkip[] = [];
  const riders: Rider[] = [];
  for (const entry of [...entries].sort((a, b) => a.number - b.number)) {
    if (only && !only.has(entry.number)) continue;
    // A second-class rider has one card per lap, so labels follow their first class.
    const className = entry.classes[0] ?? '';
    const cls = setup.classes.find((c) => c.name === className);
    const skip = (reason: LabelSkip['reason']) =>
      skipped.push({ number: entry.number, reason, className });
    if (!cls) skip('unknown_class');
    else if (cls.scored === false && !options.includeNotScored) skip('not_scored');
    else if (entry.status === 'dns') skip('dns');
    else if (days.every((d) => lapsFor(setup, className, d) === 0)) skip('no_laps');
    else riders.push({ entry, className });
  }

  const mostLaps = Math.max(
    0,
    ...riders.flatMap((r) => days.map((d) => lapsFor(setup, r.className, d))),
  );
  const choice = options.layout ?? setup.labels?.layout ?? 'auto';
  const layout: LabelLayout =
    choice === 'auto' ? (mostLaps <= template.columns ? 'row-per-rider' : 'packed') : choice;

  const label = (r: Rider, day: number, lap: number): CardLabel => {
    const { entry } = r;
    const person = entry.riders[0];
    const mark = COMPETITION_STATUS_MARK[entry.competitionStatus];
    const lapText = dayCount > 1 ? `D${day}·LAP ${lap}` : `LAP ${lap}`;
    const classLine = mark ? `${r.className} · ${mark}` : r.className;
    return {
      number: entry.number,
      day,
      lap,
      lapText: fitLap(lapText, entry.number, width),
      name: fitName(person?.givenName ?? '', person?.familyName ?? '', width),
      classText: { text: cutToFit(classLine, width, CLASS_PT), pt: CLASS_PT },
      qr: qrPayload(setup.event.code, entry.number, day, lap),
    };
  };

  const wanted = (r: Rider, day: number, lap: number) =>
    lap <= lapsFor(setup, r.className, day) &&
    !options.exclude?.has(labelKey(r.entry.number, day, lap));

  const slots: LabelSlot[] = Array.from({ length: start - 1 }, () => null);
  if (layout === 'by-lap') {
    for (const day of days) {
      for (let lap = 1; lap <= mostLaps; lap++) {
        for (const r of riders) {
          if (wanted(r, day, lap)) slots.push(label(r, day, lap));
        }
      }
    }
  } else {
    for (const r of riders) {
      for (const day of days) {
        const laps = lapsFor(setup, r.className, day);
        const todo = Array.from({ length: laps }, (_, i) => i + 1).filter((lap) =>
          wanted(r, day, lap),
        );
        if (todo.length === 0) continue;
        // One rider per row: each rider (and each day) starts a fresh row.
        if (layout === 'row-per-rider') {
          while (slots.length % template.columns !== 0) slots.push(null);
        }
        for (const lap of todo) slots.push(label(r, day, lap));
      }
    }
  }

  const labels = slots.filter((s) => s !== null).length;
  return {
    layout,
    slots,
    labels,
    riders: new Set(slots.flatMap((s) => (s ? [s.number] : []))).size,
    sheets: labels === 0 ? 0 : Math.ceil(slots.length / perSheet),
    skipped,
  };
}
