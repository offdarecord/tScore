/**
 * The Scan desk's decisions, kept apart from the screen so they can be tested: when a reading
 * is steady, whose card it is, and whether it can be saved without a person looking.
 */
import i18next from '../i18n';
import { canAutoAccept, type CardProfile } from '@tscore/core';
import type { CardReading, LabelId } from '@tscore/vision';
import type { CardRow, DeskRider } from '../../../shared/ipc';

/** The same reading this many frames in a row (about 0.75 s) before anything happens. */
export const STEADY_FRAMES = 3;

/** A reading as a short string, to compare frames. */
export function readingKey(card: CardReading): string {
  return card.rows
    .map((r) => (r.value === null ? (r.flag ?? '?') : `${r.value}${r.inverse ? 'i' : ''}`))
    .join(',');
}

/** Keeps the last few readings and says when one has been steady long enough. */
export class SteadyGate {
  #keys: string[] = [];
  /** Add a frame's reading (null = no card in this frame). True once it's steady. */
  push(card: CardReading | null): boolean {
    this.#keys.push(card ? readingKey(card) : '');
    if (this.#keys.length > STEADY_FRAMES) this.#keys.shift();
    return (
      card !== null &&
      this.#keys.length === STEADY_FRAMES &&
      this.#keys.every((k) => k === this.#keys[0])
    );
  }
  reset(): void {
    this.#keys = [];
  }
}

export interface Identity {
  readonly number: number;
  readonly day: number;
  readonly lap: number;
  /** From the label's QR, or typed by the desk. */
  readonly from: 'label' | 'typed';
}

/** The lap to expect from a rider on a day: the first lap not in yet (or the last lap). */
export function nextLap(rider: DeskRider, day: number, cards: readonly CardRow[]): number {
  const laps = rider.rides[day]?.laps ?? 1;
  for (let lap = 1; lap <= laps; lap++) {
    if (!cards.some((c) => c.number === rider.number && c.day === day && c.lap === lap)) return lap;
  }
  return laps;
}

/** Identity from a label, if it's for this event. */
export function fromLabel(label: LabelId | null, eventCode: string): Identity | null {
  if (!label || label.event !== eventCode) return null;
  return { number: label.number, day: label.day, lap: label.lap, from: 'label' };
}

export type Verdict =
  | {
      readonly kind: 'save';
      readonly scores: readonly number[];
      readonly confidence: readonly number[];
      readonly inverse: readonly number[];
    }
  | {
      readonly kind: 'review';
      readonly scores: readonly (number | null)[];
      readonly confidence: readonly (number | null)[];
      readonly reasons: readonly (string | null)[];
      /** Sections past the class's count that have a punch (EXTRA_ROWS). */
      readonly extraRows: readonly number[];
      /**
       * Every section was read clearly, but the card's profile is assisted: a person confirms
       * the reading before it's saved.
       */
      readonly confirm: boolean;
    }
  | { readonly kind: 'problem'; readonly message: string };

/**
 * What to do with a steady reading for a rider: save it straight away only when every section
 * the class rides is read clearly, nothing is punched past them (architecture §5.4), and the
 * card's profile is trusted (#105). An assisted profile's cards are always confirmed by a person.
 */
export function verdict(
  card: CardReading,
  id: Identity,
  riders: readonly DeskRider[],
  cards: readonly CardRow[],
  profile: Pick<CardProfile, 'trust'>,
): Verdict {
  const rider = riders.find((r) => r.number === id.number);
  if (!rider)
    return { kind: 'problem', message: i18next.t('scan.notListed', { number: id.number }) };
  if (rider.status === 'dns')
    return { kind: 'problem', message: i18next.t('scan.dns', { number: id.number }) };
  const ride = rider.rides[id.day];
  if (!ride)
    return {
      kind: 'problem',
      message: i18next.t('scan.notThatDay', { number: id.number, day: id.day }),
    };
  if (id.lap < 1 || id.lap > ride.laps) {
    return {
      kind: 'problem',
      message: i18next.t('scan.laps', { number: id.number, laps: ride.laps, day: id.day }),
    };
  }
  if (cards.some((c) => c.number === id.number && c.day === id.day && c.lap === id.lap)) {
    return {
      kind: 'problem',
      message: i18next.t('scan.alreadyIn', { number: id.number, lap: id.lap }),
    };
  }
  const active = card.rows.slice(0, ride.sections);
  const extraRows = card.rows
    .slice(ride.sections)
    .filter((r) => r.punched.some(Boolean))
    .map((r) => r.section);
  const clear = active.every((r) => r.value !== null && !r.flag);
  if (clear && extraRows.length === 0 && canAutoAccept(profile)) {
    return {
      kind: 'save',
      scores: active.map((r) => r.value ?? 0),
      confidence: active.map((r) => r.margin),
      inverse: active.filter((r) => r.inverse).map((r) => r.section),
    };
  }
  return {
    kind: 'review',
    scores: active.map((r) => (r.flag ? null : r.value)),
    confidence: active.map((r) => r.margin),
    reasons: active.map((r) => r.flag ?? null),
    extraRows,
    confirm: clear && extraRows.length === 0,
  };
}
