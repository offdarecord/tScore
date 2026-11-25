import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAILTO_MAX,
  renderSuggestionIssueForm,
  renderSuggestionPage,
  SUGGESTION_EMAIL,
  SUGGESTION_QUESTIONS,
  suggestionMailto,
  suggestionMissing,
  suggestionText,
} from './suggestion.js';

const root = resolve(import.meta.dirname, '../../..');
const ctx = { version: '0.7.0', windows: 'Windows 11 (10.0.26200)', screen: 'Results' };

describe('suggest a feature', () => {
  it('needs the required answers before making the text', () => {
    expect(suggestionMissing({ summary: 'Bigger numbers', role: '  ' })).toEqual([
      'What do you do at events?',
      "What happens today, and what's hard about it?",
      "How would you know it's working?",
    ]);
    expect(suggestionMissing({ summary: 'x', role: 'Observer', today: 'x', success: 'x' })).toEqual(
      [],
    );
  });

  it('makes plain text in a fixed order, with only the version, Windows and the screen added', () => {
    const text = suggestionText({ summary: 'Bigger numbers', role: 'Results desk' }, ctx);
    expect(text).toMatch(
      /^tScore feature suggestion\n=+\n\n1\. In a few words, what would you like\?\nBigger numbers\n\n2\. /,
    );
    expect(text).toContain('4. What would you like tScore to do instead?\n(not answered)');
    expect(text.trimEnd().split('\n').slice(-4)).toEqual([
      '---',
      'tScore version: 0.7.0',
      'Windows: Windows 11 (10.0.26200)',
      'Screen: Results',
    ]);
  });

  it('emails short suggestions in the link, and longer ones via the clipboard', () => {
    const short = suggestionMailto('Hello & thanks');
    expect(short).toBe(
      `mailto:${SUGGESTION_EMAIL}?subject=tScore%20feature%20suggestion&body=Hello%20%26%20thanks`,
    );
    expect(suggestionMailto('x'.repeat(MAILTO_MAX))).toBeNull();
  });

  it('asks the same questions in the app, on the public page and in the issue form', () => {
    const page = readFileSync(join(root, 'docs/suggest-a-feature.md'), 'utf8');
    const form = readFileSync(join(root, '.github/ISSUE_TEMPLATE/feature_request.yml'), 'utf8');
    expect(page, 'run npm run gen:suggestion').toBe(renderSuggestionPage());
    expect(form, 'run npm run gen:suggestion').toBe(renderSuggestionIssueForm());
    for (const q of SUGGESTION_QUESTIONS) {
      expect(page).toContain(q.label);
      expect(form).toContain(q.label.replace(/'/g, "''"));
    }
  });
});
