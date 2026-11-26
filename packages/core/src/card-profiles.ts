/**
 * Card profiles shipped with tScore (presets/card-profiles/, ADR 0008, issue #105): each
 * scorecard design as data, checked against its schema when loaded.
 */
import regional16 from '../../../presets/card-profiles/regional-16.json';
import type { CardProfile } from './generated/card-profile.js';
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
  return p;
}

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
