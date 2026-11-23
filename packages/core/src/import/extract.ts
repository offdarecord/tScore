/**
 * Step 1 of rider import: recognise the file and copy out only the columns its preset
 * declares. Everything else in the file (dates of birth, addresses, phone numbers, medical
 * and emergency details) is dropped here and never goes further.
 */
import { detectPreset, IMPORT_PRESETS, norm, type Field, type ImportMapping } from './presets.js';

/** One sheet of a workbook (or a CSV file), every cell as text. */
export interface SourceTable {
  readonly sheet?: string;
  readonly rows: readonly (readonly string[])[];
}

/** One row of the entry list, holding only the fields the preset reads. */
export type SourceRow = { readonly line: number } & Partial<Record<Field, string>>;

export interface EntryList {
  readonly presetId: string;
  /** e.g. "Ridernet export". */
  readonly source: string;
  /** Fields whose column was found in the file. Rules on other fields don't apply. */
  readonly fields: readonly Field[];
  readonly rows: readonly SourceRow[];
}

export class ImportError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
  }
}

const REQUIRED: readonly Field[] = ['given_name', 'family_name', 'class'];

/** Recognise the entry list and extract its riders' scoring fields. */
export function readEntryList(
  tables: readonly SourceTable[],
  presets: readonly ImportMapping[] = IMPORT_PRESETS,
): EntryList {
  const found = findSheet(tables, presets);
  if (!found) {
    throw new ImportError(
      'IMPORT_UNKNOWN_FORMAT',
      "tScore doesn't recognise this file. It reads Entryplace and Ridernet exports as they " +
        'come, and any other list saved in the tScore rider-list format.',
    );
  }
  const { preset, table, headerAt } = found;
  const header = (table.rows[headerAt] ?? []).map(norm);

  const index: Partial<Record<Field, number>> = {};
  for (const [field, names] of Object.entries(preset.columns) as [Field, string[]][]) {
    if (field === 'number' && !preset.keep_numbers) continue;
    const i = names.map((n) => header.indexOf(norm(n))).find((x) => x >= 0);
    if (i !== undefined) index[field] = i;
  }
  const missing = REQUIRED.filter((f) => index[f] === undefined);
  if (missing.length > 0) {
    throw new ImportError(
      'IMPORT_MISSING_COLUMN',
      `This ${preset.name} has no ${missing.map((f) => `"${preset.columns[f]?.[0] ?? f}"`).join(' or ')} column.`,
    );
  }

  const rows: SourceRow[] = [];
  table.rows.forEach((cells, i) => {
    if (i <= headerAt || cells.every((c) => c.trim() === '')) return;
    const row: Partial<Record<Field, string>> = {};
    for (const [field, at] of Object.entries(index) as [Field, number][]) {
      const v = (cells[at] ?? '').trim();
      if (v !== '') row[field] = v;
    }
    rows.push({ line: i + 1, ...row });
  });
  return {
    presetId: preset.id,
    source: preset.name,
    fields: Object.keys(index) as Field[],
    rows,
  };
}

function findSheet(tables: readonly SourceTable[], presets: readonly ImportMapping[]) {
  // The header is the first row with anything in it.
  const candidates = tables.map((table) => {
    const headerAt = table.rows.findIndex((r) => r.some((c) => c.trim() !== ''));
    return { table, headerAt };
  });
  for (const { table, headerAt } of candidates) {
    if (headerAt < 0) continue;
    const preset = detectPreset(table.rows[headerAt] ?? [], presets);
    if (!preset) continue;
    // Prefer the preset's named sheet when the workbook has it.
    const named = preset.sheet
      ? candidates.find(
          (c) => c.table.sheet !== undefined && norm(c.table.sheet) === norm(preset.sheet ?? ''),
        )
      : undefined;
    if (
      named &&
      named.headerAt >= 0 &&
      detectPreset(named.table.rows[named.headerAt] ?? [], [preset])
    ) {
      return { preset, ...named };
    }
    return { preset, table, headerAt };
  }
  return undefined;
}
