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

/**
 * What tScore saw in a file it couldn't read, for the diagnostic log. Holds no cell contents:
 * only counts, and which of each preset's own header names were found.
 */
export interface FileDiagnostics {
  readonly sheets: readonly { readonly rows: number; readonly columns: number }[];
  readonly presets: readonly {
    readonly id: string;
    readonly found: readonly string[];
    readonly missing: readonly string[];
  }[];
}

export class ImportError extends Error {
  readonly code: string;
  readonly diagnostics?: FileDiagnostics;
  constructor(code: string, message: string, diagnostics?: FileDiagnostics) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    if (diagnostics) this.diagnostics = diagnostics;
  }
}

/** The first row with anything in it: where the column names are. */
function headerOf(table: SourceTable): readonly string[] {
  return table.rows.find((r) => r.some((c) => c.trim() !== '')) ?? [];
}

function diagnose(
  tables: readonly SourceTable[],
  presets: readonly ImportMapping[],
): FileDiagnostics {
  const headers = tables.map((t) => new Set(headerOf(t).map(norm)));
  return {
    sheets: tables.map((t) => ({
      rows: t.rows.length,
      columns: Math.max(0, ...t.rows.map((r) => r.length)),
    })),
    presets: presets.map((p) => {
      // The sheet closest to this preset.
      const best = headers
        .map((h) => p.detect.headers.filter((name) => h.has(norm(name))))
        .reduce<string[]>((a, b) => (b.length > a.length ? b : a), []);
      return {
        id: p.id,
        found: best,
        missing: p.detect.headers.filter((name) => !best.includes(name)),
      };
    }),
  };
}

/** Another export from a known entry system (one people pick by mistake), if this is one. */
function otherExport(tables: readonly SourceTable[], presets: readonly ImportMapping[]) {
  for (const t of tables) {
    const have = new Set(headerOf(t).map(norm));
    for (const p of presets) {
      const hit = p.other_exports?.find((o) => o.headers.every((h) => have.has(norm(h))));
      if (hit) return hit;
    }
  }
  return undefined;
}

const REQUIRED: readonly Field[] = ['given_name', 'family_name', 'class'];

/** Recognise the entry list and extract its riders' scoring fields. */
export function readEntryList(
  tables: readonly SourceTable[],
  presets: readonly ImportMapping[] = IMPORT_PRESETS,
): EntryList {
  const found = findSheet(tables, presets);
  if (!found) {
    const diagnostics = diagnose(tables, presets);
    const other = otherExport(tables, presets);
    if (other) throw new ImportError('IMPORT_OTHER_EXPORT', other.message, diagnostics);
    throw new ImportError(
      'IMPORT_UNKNOWN_FORMAT',
      "tScore doesn't recognise this file. It reads Entryplace and Ridernet exports as they " +
        'come, and any other list saved in the tScore rider-list format.',
      diagnostics,
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
