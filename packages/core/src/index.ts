export { SCORE_VALUES, isScoreValue, type ScoreValue } from './scores.js';

export type { ValidationIssue, ValidationResult } from './validation.js';
export { validateEventSetup, CARD_PROFILE_ROWS, DEFAULT_CARD_PROFILE } from './setup-validation.js';
export { validateResults } from './results-validation.js';
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
