import type { ErrorObject } from 'ajv';
import type { SchemaValidator } from './generated/validators.js';

/** One problem found in a file, with where it is and what to do about it. */
export interface ValidationIssue {
  /** Location in the file, e.g. `classes[2].days.1.sections`. Empty for the whole file. */
  readonly path: string;
  /** Plain-English description of the problem. */
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

/** `/classes/2/days/1` → `classes[2].days.1` */
export function toPath(pointer: string): string {
  return pointer
    .split('/')
    .slice(1)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce(
      (acc, part) =>
        /^\d+$/.test(part) && acc ? `${acc}[${part}]` : acc ? `${acc}.${part}` : part,
      '',
    );
}

export function joinPath(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`;
  return base ? `${base}.${key}` : key;
}

function describe(error: ErrorObject): ValidationIssue {
  const path = toPath(error.instancePath);
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'additionalProperties':
      return { path, message: `unknown field "${String(params['additionalProperty'])}"` };
    case 'required':
      return { path, message: `missing required field "${String(params['missingProperty'])}"` };
    case 'enum':
      return {
        path,
        message: `must be one of: ${(params['allowedValues'] as unknown[]).map(String).join(', ')}`,
      };
    case 'const':
      return { path, message: `must be "${String(params['allowedValue'])}"` };
    default:
      return { path, message: error.message ?? 'is not valid' };
  }
}

/** Run a generated schema validator and turn its errors into issues. */
export function checkSchema<T>(validate: SchemaValidator, data: unknown): ValidationResult<T> {
  if (validate(data)) return { ok: true, value: data as T };
  const errors = validate.errors ?? [];
  // `if`/`anyOf` wrappers repeat the real error; keep the specific ones.
  const issues = errors.filter((e) => e.keyword !== 'if' && e.keyword !== 'anyOf').map(describe);
  return { ok: false, issues: issues.length ? issues : [{ path: '', message: 'is not valid' }] };
}
