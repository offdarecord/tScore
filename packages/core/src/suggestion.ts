/**
 * "Suggest a feature": the questions asked in the app (About → Suggest a feature), on the public
 * page (docs/suggest-a-feature.md) and in the GitHub issue form, kept identical by generating
 * the page and the form from this list (`npm run gen:suggestion`).
 *
 * The app adds only its version, the Windows version and which screen was open. Never event
 * data, rider data or files: the person's own words are the whole suggestion.
 */

/** A tScore-only address (never a personal one). */
export const SUGGESTION_EMAIL = 'tscoreapp@outlook.com';
export const SUGGESTION_SUBJECT = 'tScore feature suggestion';
/** Some mail apps cut a longer `mailto:` link off. Past this, the text goes via the clipboard. */
export const MAILTO_MAX = 1800;

export interface SuggestionQuestion {
  readonly id: string;
  readonly label: string;
  readonly help?: string;
  readonly required: boolean;
  /** `line`: one line; `text`: a few lines; `choice`: one of `options`. */
  readonly kind: 'line' | 'text' | 'choice';
  readonly options?: readonly string[];
}

export const SUGGESTION_QUESTIONS: readonly SuggestionQuestion[] = [
  { id: 'summary', label: 'In a few words, what would you like?', required: true, kind: 'line' },
  {
    id: 'role',
    label: 'What do you do at events?',
    required: true,
    kind: 'choice',
    options: ['Results desk', 'Club secretary', 'Clerk of Course', 'Observer', 'Rider', 'Other'],
  },
  {
    id: 'today',
    label: "What happens today, and what's hard about it?",
    help: 'How do you get round it now?',
    required: true,
    kind: 'text',
  },
  {
    id: 'proposal',
    label: 'What would you like tScore to do instead?',
    required: false,
    kind: 'text',
  },
  {
    id: 'success',
    label: "How would you know it's working?",
    help: 'Describe the moment at an event when it pays off.',
    required: true,
    kind: 'text',
  },
  {
    id: 'not',
    label: 'What should it not do?',
    help: "Anything that would make it worse, or that's out of scope.",
    required: false,
    kind: 'text',
  },
  {
    id: 'when',
    label: 'When does it matter?',
    required: false,
    kind: 'choice',
    options: ['Before the event', 'On the day', 'After the event (results and publishing)'],
  },
  {
    id: 'value',
    label: 'How much would it help?',
    required: false,
    kind: 'choice',
    options: ['Nice to have', 'Saves time every event', "We can't run our event without it"],
  },
  {
    id: 'example',
    label: 'Example or picture',
    help: "Describe it, or attach a photo of a paper form or a screenshot to your email or issue. Please hide riders' names and details.",
    required: false,
    kind: 'text',
  },
  {
    id: 'contact',
    label: 'Can we contact you about it?',
    help: 'Name and club. Removed before anything is made public.',
    required: false,
    kind: 'line',
  },
];

export type SuggestionAnswers = Readonly<Record<string, string | undefined>>;

/** Added by the app, never typed: nothing about the event or riders. */
export interface SuggestionContext {
  readonly version: string;
  readonly windows: string;
  readonly screen: string;
}

/** The required questions not answered yet (their labels). */
export function suggestionMissing(answers: SuggestionAnswers): string[] {
  return SUGGESTION_QUESTIONS.filter((q) => q.required && !answers[q.id]?.trim()).map(
    (q) => q.label,
  );
}

/** The suggestion as plain text in a fixed format, for email, the clipboard or a file. */
export function suggestionText(answers: SuggestionAnswers, ctx: SuggestionContext): string {
  const parts = SUGGESTION_QUESTIONS.map((q, i) => {
    const a = answers[q.id]?.trim().replace(/\r\n?/g, '\n');
    return `${i + 1}. ${q.label}\n${a || '(not answered)'}`;
  });
  return [
    SUGGESTION_SUBJECT,
    '='.repeat(SUGGESTION_SUBJECT.length),
    '',
    parts.join('\n\n'),
    '',
    '---',
    `tScore version: ${ctx.version}`,
    `Windows: ${ctx.windows}`,
    `Screen: ${ctx.screen}`,
    '',
  ].join('\n');
}

/** The `mailto:` link, or null when the text is too long for one (use the clipboard). */
export function suggestionMailto(text: string): string | null {
  const url = `mailto:${SUGGESTION_EMAIL}?subject=${encodeURIComponent(SUGGESTION_SUBJECT)}&body=${encodeURIComponent(text)}`;
  return url.length <= MAILTO_MAX ? url : null;
}

const GENERATED = 'Generated from packages/core/src/suggestion.ts by `npm run gen:suggestion`.';

/** docs/suggest-a-feature.md: the same questions, to copy and paste. */
export function renderSuggestionPage(): string {
  const questions = SUGGESTION_QUESTIONS.map((q, i) => {
    const star = q.required ? ' (required)' : ' (optional)';
    const help = q.help ? `\n   ${q.help}` : '';
    const options = q.options ? `\n   Choose one: ${q.options.join(' / ')}.` : '';
    return `${i + 1}. **${q.label}**${star}${help}${options}`;
  }).join('\n');
  const template = SUGGESTION_QUESTIONS.map((q, i) => `${i + 1}. ${q.label}\n`).join('\n');
  return `<!-- ${GENERATED} -->

# Suggest a feature

Ideas from the people who run events are how tScore gets better. You don't need a GitHub
account.

## The easy way: in tScore

Open **About**, then **Suggest a feature**. Answer the questions, then choose **Email**,
**Copy** or **Save as file**. It works without internet: save it and send it later. tScore adds
only its version, the Windows version and which screen you were on. It never adds event or rider
details.

## Without tScore

Copy the questions below into an email to **${SUGGESTION_EMAIL}**, or, if you have a GitHub
account, use the [feature request form](https://github.com/offdarecord/tScore/issues/new?template=feature_request.yml).

${questions}

Please don't include riders' names, licence numbers or contact details, and hide them in any
photo.

### To copy

\`\`\`text
${template}\`\`\`
`;
}

/** .github/ISSUE_TEMPLATE/feature_request.yml: the same questions as a GitHub issue form. */
export function renderSuggestionIssueForm(): string {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const body = SUGGESTION_QUESTIONS.map((x) => {
    const type = x.kind === 'choice' ? 'dropdown' : x.kind === 'line' ? 'input' : 'textarea';
    const lines = [
      `  - type: ${type}`,
      `    id: ${x.id}`,
      '    attributes:',
      `      label: ${q(x.label)}`,
    ];
    if (x.help) lines.push(`      description: ${q(x.help)}`);
    if (x.options) {
      lines.push('      options:');
      for (const o of x.options) lines.push(`        - ${q(o)}`);
    }
    lines.push('    validations:', `      required: ${x.required}`);
    return lines.join('\n');
  }).join('\n');
  return `# ${GENERATED}
name: Idea or feature request
description: Suggest something that would help your club
labels: [enhancement]
body:
  - type: markdown
    attributes:
      value: "No GitHub account? Use **About → Suggest a feature** in tScore, or email the same questions to ${SUGGESTION_EMAIL}. Please don't post riders' names or details."
${body}
`;
}
