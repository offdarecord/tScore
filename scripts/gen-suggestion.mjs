// Generates the "Suggest a feature" page (docs/suggest-a-feature.md) and the GitHub issue form
// (.github/ISSUE_TEMPLATE/feature_request.yml) from the questions in
// packages/core/src/suggestion.ts, so the app, the page and the form ask the same questions.
//
//   npm run gen:suggestion               regenerate
//   npm run gen:suggestion -- --check    fail if either file is out of date (CI)

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(import.meta.url);
const { renderSuggestionPage, renderSuggestionIssueForm } = await jiti.import(
  join(root, 'packages/core/src/suggestion.ts'),
);

const files = [
  ['docs/suggest-a-feature.md', renderSuggestionPage()],
  ['.github/ISSUE_TEMPLATE/feature_request.yml', renderSuggestionIssueForm()],
];
let stale = false;
for (const [path, wanted] of files) {
  const file = join(root, path);
  if (process.argv.includes('--check')) {
    if ((await readFile(file, 'utf8').catch(() => '')) !== wanted) {
      console.error(`${path} is out of date. Run: npm run gen:suggestion`);
      stale = true;
    }
  } else {
    await writeFile(file, wanted);
    console.log(`Wrote ${path}`);
  }
}
if (stale) process.exit(1);
