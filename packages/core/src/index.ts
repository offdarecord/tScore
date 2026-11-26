export { SCORE_VALUES, isScoreValue, type ScoreValue } from './scores.js';
export {
  readTypedScores,
  describeTypedScoreProblem,
  singleDigitScores,
  type TypedScores,
  type TypedScoreProblem,
} from './typed-scores.js';

export type { ValidationIssue, ValidationResult } from './validation.js';
export { validateEventSetup, CARD_PROFILE_ROWS, DEFAULT_CARD_PROFILE } from './setup-validation.js';
export { validateResults } from './results-validation.js';
// Card profiles (#105; presets in presets/card-profiles/).
export {
  CARD_PROFILES,
  canAutoAccept,
  cardProfile,
  checkCardProfile,
  MARKING_STYLE_THRESHOLDS,
  type CardColumn,
  type MarkingStyle,
  type CardProfile,
  type CardThresholds,
  type CardTunedFrom,
} from './card-profiles.js';
// Sharing card profiles as .tscore-card files (#108).
export {
  BLANK_IMAGE_MAX_BYTES,
  CARD_SHARE_EXTENSION,
  CARD_SHARE_MAX_BYTES,
  CARD_SHARE_PROFILE,
  CardShareError,
  badCardFile,
  blankImageName,
  blankImageType,
  cardShareFileName,
  cardShareMailto,
  importedCardProfile,
  sharedCardProfile,
  type BlankImageType,
  type CardCredit,
} from './card-share.js';
export { CONTACT, checkContact, type Contact } from './contact.js';
export * from './results/index.js';

// Types generated from schemas/ (ADR 0008).
export type { EventSetup } from './generated/event-setup.js';
export type { Results } from './generated/results.js';
export type * as EventSetupTypes from './generated/event-setup.js';
export type * as ResultsTypes from './generated/results.js';
export {
  newEventSetup,
  suggestEventCode,
  isEventCode,
  STARTER_CLASSES,
  STARTER_SECTIONS,
  STARTER_LAPS,
} from './setup-defaults.js';

// Rider import (architecture §8; presets in presets/import-mappings/).
export * from './import/index.js';

// Card labels (architecture §8.1; templates in presets/label-templates/).
export * from './labels/index.js';

// Series points across the rounds of a series (issue #14).
export * from './series.js';

// Suggest a feature: one list of questions for the app, the public page and the issue form.
export * from './suggestion.js';

// The error catalogue (ADR 0012; docs/guide/errors.md).
export * from './errors.js';

// Progress and still on course (architecture §9).
export * from './course.js';
export * from './test-trial.js';
export * from './words.js';
// The tScore credit on results (#110).
export * from './credit.js';
