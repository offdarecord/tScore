/**
 * The entry-system presets shipped with tScore (presets/import-mappings/, ADR 0008), checked
 * against their schema when loaded, and the rules for recognising which one a file is.
 */
import entryplace from '../../../../presets/import-mappings/entryplace.json';
import ridernet from '../../../../presets/import-mappings/ridernet.json';
import riderList from '../../../../presets/import-mappings/tscore-rider-list.json';
import type {
  Field,
  ImportMapping,
  SkipRule,
  CompetitionStatusRule,
} from '../generated/import-mapping.js';
import { validateImportMappingSchema } from '../generated/validators.js';
import { checkSchema } from '../validation.js';

export type { Field, ImportMapping } from '../generated/import-mapping.js';

/** A rule with its pattern compiled. */
export interface Matcher {
  readonly field: Field;
  test(value: string): boolean;
}

/** Lower case, spaces trimmed and collapsed: how header names and rule values are compared. */
export function norm(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Check a preset against its schema and the rules the schema can't express. */
export function checkPreset(data: unknown): ImportMapping {
  const r = checkSchema<ImportMapping>(validateImportMappingSchema, data);
  if (!r.ok) {
    throw new Error(
      `Import preset is not valid: ${r.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
    );
  }
  for (const rule of [...(r.value.skip_rows ?? []), ...(r.value.competition_status_rules ?? [])]) {
    matcher(rule); // throws if the rule is malformed
    if (!r.value.columns[rule.field]) {
      throw new Error(
        `Import preset ${r.value.id}: a rule uses "${rule.field}", which isn't read.`,
      );
    }
  }
  return r.value;
}

/** Compile one skip or competition status rule. Exactly one of in, not_in and pattern. */
export function matcher(rule: SkipRule | CompetitionStatusRule): Matcher {
  const kinds = [rule.in, rule.not_in, rule.pattern].filter((k) => k !== undefined);
  if (kinds.length !== 1) {
    throw new Error(`An import rule on "${rule.field}" needs exactly one of in, not_in, pattern.`);
  }
  if (rule.in) {
    const set = new Set(rule.in.map(norm));
    return { field: rule.field, test: (v) => set.has(norm(v)) };
  }
  if (rule.not_in) {
    const set = new Set(rule.not_in.map(norm));
    return { field: rule.field, test: (v) => !set.has(norm(v)) };
  }
  const re = new RegExp(rule.pattern ?? '', 'i');
  return { field: rule.field, test: (v) => re.test(v.trim()) };
}

/** Built-in presets, most specific first. */
export const IMPORT_PRESETS: readonly ImportMapping[] = [entryplace, ridernet, riderList].map(
  checkPreset,
);

/** The preset whose detect headers are all in this header row, if any. */
export function detectPreset(
  header: readonly string[],
  presets: readonly ImportMapping[] = IMPORT_PRESETS,
): ImportMapping | undefined {
  const have = new Set(header.map(norm));
  return presets.find((p) => p.detect.headers.every((h) => have.has(norm(h))));
}
