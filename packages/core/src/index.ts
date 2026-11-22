export { SCORE_VALUES, isScoreValue, type ScoreValue } from './scores.js';

export type { ValidationIssue, ValidationResult } from './validation.js';
export { validateEventSetup, CARD_PROFILE_ROWS, DEFAULT_CARD_PROFILE } from './setup-validation.js';
export { validateResults } from './results-validation.js';

// Types generated from schemas/ (ADR 0008).
export type { EventSetup } from './generated/event-setup.js';
export type { Results } from './generated/results.js';
export type * as EventSetupTypes from './generated/event-setup.js';
export type * as ResultsTypes from './generated/results.js';
