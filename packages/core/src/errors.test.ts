import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ERROR_AREAS,
  ERROR_CATALOGUE,
  errorAnchor,
  errorEntry,
  publicErrorCode,
  renderErrorCatalogue,
} from './errors.js';

const root = resolve(import.meta.dirname, '../../..');

/** Source files that can raise an error the desk sees. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'generated') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every internal error name used in the code: `'STORE_…'`, `'APP_…'`, `'IMPORT_…'`. */
function internalNamesInCode(): Set<string> {
  const dirs = [
    ...readdirSync(join(root, 'packages')).map((p) => join(root, 'packages', p, 'src')),
    join(root, 'apps/desktop/src'),
  ];
  const names = new Set<string>();
  for (const file of dirs.flatMap(sources)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/'((?:STORE|APP|IMPORT)_[A-Z_]+)'/g)) {
      names.add(m[1]!);
    }
  }
  return names;
}

describe('error catalogue', () => {
  it('gives every error the code raises a catalogue entry', () => {
    const catalogued = new Set(ERROR_CATALOGUE.flatMap((e) => e.internal));
    const missing = [...internalNamesInCode()].filter((n) => !catalogued.has(n));
    expect(missing, 'add these to packages/core/src/errors.ts').toEqual([]);
  });

  it('uses each code and internal name once, in a known area', () => {
    const areas = new Set<string>(ERROR_AREAS.map((a) => a.area));
    const codes = ERROR_CATALOGUE.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    const internal = ERROR_CATALOGUE.flatMap((e) => e.internal);
    expect(new Set(internal).size).toBe(internal.length);
    for (const e of ERROR_CATALOGUE) {
      expect(e.code).toMatch(/^TS-[A-Z]+-\d{3}$/);
      expect(areas).toContain(e.code.split('-')[1]);
      expect(e.title.length, e.code).toBeGreaterThan(0);
      expect(e.meaning.length, e.code).toBeGreaterThan(0);
      expect(e.fix.length, e.code).toBeGreaterThan(0);
      expect(e.internal.length, e.code).toBeGreaterThan(0);
    }
  });

  it('maps internal names to public codes, with the general entry as a fallback', () => {
    expect(publicErrorCode('STORE_DAMAGED')).toBe('TS-DB-003');
    expect(publicErrorCode('NOT_A_REAL_NAME')).toBe('TS-APP-001');
    expect(errorEntry('APP_NUMBER_TAKEN').code).toBe('TS-RID-001');
    expect(errorAnchor('TS-DB-003')).toBe('ts-db-003');
  });

  it('matches the generated error-code page (run `npm run gen:errors`)', () => {
    const page = readFileSync(join(root, 'docs/guide/errors.md'), 'utf8');
    expect(page).toBe(renderErrorCatalogue());
    for (const e of ERROR_CATALOGUE) expect(page).toContain(`### ${e.code}\n`);
  });
});
