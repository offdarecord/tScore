// Generates the guide's error-code page (docs/guide/errors.md) from the error catalogue in
// packages/core/src/errors.ts (ADR 0012). Never edit the generated page by hand.
//
//   npm run gen:errors               regenerate
//   npm run gen:errors -- --check    fail if the page is out of date (CI)

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = join(root, 'docs/guide/errors.md');
const jiti = createJiti(import.meta.url);
const { renderErrorCatalogue } = await jiti.import(join(root, 'packages/core/src/errors.ts'));

const wanted = renderErrorCatalogue();
if (process.argv.includes('--check')) {
  const current = await readFile(page, 'utf8').catch(() => '');
  if (current !== wanted) {
    console.error('docs/guide/errors.md is out of date. Run: npm run gen:errors');
    process.exit(1);
  }
} else {
  await writeFile(page, wanted);
  console.log('Wrote docs/guide/errors.md');
}
