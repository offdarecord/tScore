export {
  readEntryList,
  ImportError,
  type FileDiagnostics,
  type EntryList,
  type SourceRow,
  type SourceTable,
} from './extract.js';
export {
  machineOf,
  planImport,
  tidyClass,
  tidyName,
  type ClassMatch,
  type Duplicate,
  type ImportChoices,
  type ImportPlan,
  type MatchedBy,
} from './plan.js';
export { IMPORT_PRESETS, detectPreset, type ImportMapping } from './presets.js';
