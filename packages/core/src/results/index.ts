export * from './model.js';
export {
  computeResults,
  ResultsNotFinalError,
  type ResultsGap,
  type ResultsReport,
} from './compute.js';
export { makeComparator, rank, parseTieBreak, type RankKey, type Placed } from './ranking.js';
export {
  classSummary,
  entryName,
  gapWords,
  lapColumns,
  lapTotal,
  ordinal,
  penaltyPoints,
  placeLabels,
  placeChanges,
  resultsCsv,
  resultsHtml,
  tieBreakWords,
  type LapColumn,
  type PrintOptions,
  type RevisionNote,
  thanksFromSetup,
  type Thanks,
} from './output.js';
export {
  classesFromSetup,
  isJuniorClassName,
  juniorClassesFromSetup,
  scoringFromSetup,
} from './from-setup.js';
