/**
 * Card profiles shipped with tScore (presets/card-profiles/, ADR 0008, issue #105): each
 * scorecard design as data, checked against its schema when loaded.
 */
import regional16 from '../../../presets/card-profiles/regional-16.json';
import type { CardProfile, Thresholds } from './generated/card-profile.js';
import { validateCardProfileSchema } from './generated/validators.js';
import { checkSchema } from './validation.js';

export type {
  CardProfile,
  Column as CardColumn,
  Thresholds as CardThresholds,
  TunedFrom as CardTunedFrom,
} from './generated/card-profile.js';

/** Check a profile against its schema and the rules the schema can't express. */
export function checkCardProfile(data: unknown): CardProfile {
  const r = checkSchema<CardProfile>(validateCardProfileSchema, data);
  if (!r.ok) {
    throw new Error(
      `Card profile is not valid: ${r.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
    );
  }
  const p = r.value;
  const scores = p.columns.map((c) => c.score);
  if (new Set(scores).size !== scores.length) {
    throw new Error(`Card profile ${p.id}: two columns stand for the same score.`);
  }
  const across = p.columns.map((c) => c.across);
  if (new Set(across).size !== across.length) {
    throw new Error(`Card profile ${p.id}: two columns are in the same place.`);
  }
  // A wrong auto-accept is the expensive error: a profile that ever made one can't be trusted.
  if (p.trust === 'trusted' && p.thresholds.tuned_from.wrong_auto_accepts > 0) {
    throw new Error(
      `Card profile ${p.id}: its thresholds read a wrong score, so it can only be assisted.`,
    );
  }
  // Pen and ink marks are tuned on drawn cards only until real ones arrive (#129): a person
  // confirms every card read with them.
  if (
    p.trust === 'trusted' &&
    p.marking_style !== 'punch' &&
    p.thresholds.tuned_from.source !== 'real'
  ) {
    throw new Error(
      `Card profile ${p.id}: ${p.marking_style} marks aren't tuned on real cards yet, so it can only be assisted.`,
    );
  }
  return p;
}

export type MarkingStyle = CardProfile['marking_style'];

/**
 * Starting thresholds for each way observers mark a card (#104), for a new profile. A cell is
 * read as change from the blank card (0 = as blank, 1 = black right across it), so the printed
 * digit doesn't count.
 *
 * - punch: a hole shows the black backing across the whole cell; the regional card's tuned
 *   values (presets/card-profiles/regional-16.json).
 * - pen-hole: a small, ragged hole covers part of the cell, so less change counts as a mark.
 *   Give the profile a cell radius about the size of a pen hole.
 * - ink: ink is never as dark as the backing. Brightness (luma) sees black, blue and red ink;
 *   a profile can choose one colour instead (red sees blue ink most strongly, but not red ink).
 *
 * Pen-hole and ink values are tuned on drawn cards only; real cards tune them in #129.
 */
export const MARKING_STYLE_THRESHOLDS: Readonly<
  Record<MarkingStyle, Readonly<Pick<Thresholds, 'mark' | 'confidence_gap' | 'colour_channel'>>>
> = {
  punch: { mark: 0.55, confidence_gap: 0.2, colour_channel: 'luma' },
  'pen-hole': { mark: 0.25, confidence_gap: 0.1, colour_channel: 'luma' },
  ink: { mark: 0.35, confidence_gap: 0.12, colour_channel: 'luma' },
};

/** Built-in profiles; the first is the default. */
export const CARD_PROFILES: readonly CardProfile[] = [regional16].map(checkCardProfile);

export const DEFAULT_CARD_PROFILE = 'regional-16';

/** The profile with this id (the default when not set), or undefined when it's unknown. */
export function cardProfile(
  id: string | undefined,
  profiles: readonly CardProfile[] = CARD_PROFILES,
): CardProfile | undefined {
  return profiles.find((p) => p.id === (id ?? DEFAULT_CARD_PROFILE));
}

/**
 * Whether a clearly read card of this profile may be saved without a person looking. Only a
 * trusted profile's cards can be; an assisted profile's reading is a suggestion to confirm.
 */
export function canAutoAccept(profile: Pick<CardProfile, 'trust'>): boolean {
  return profile.trust === 'trusted';
}
