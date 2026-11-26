// Generates packages/core/src/generated/results-credit.ts from assets/results-credit.jpg, so the
// results credit's logo (#110) is in core as a data: URL: the PDFs and the big screen need nothing
// from disk or the internet. The logo is all rights reserved (assets/LICENSE).
//
//   npm run gen:credit               regenerate
//   npm run gen:credit -- --check    fail if the generated file is out of date (CI)

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'packages/core/src/generated/results-credit.ts');
const jpeg = await readFile(join(root, 'assets/results-credit.jpg'));
const wanted = `// Generated from assets/results-credit.jpg by \`npm run gen:credit\`. Do not edit.
// The tScore logo: all rights reserved (assets/LICENSE). A modified version of tScore must
// replace or remove it.
export const RESULTS_CREDIT_LOGO =
  'data:image/jpeg;base64,${jpeg.toString('base64')}';
`;

if (process.argv.includes('--check')) {
  if ((await readFile(out, 'utf8').catch(() => '')) !== wanted) {
    console.error(
      'packages/core/src/generated/results-credit.ts is out of date. Run: npm run gen:credit',
    );
    process.exit(1);
  }
} else {
  await writeFile(out, wanted);
}
