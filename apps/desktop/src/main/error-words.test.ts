import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { messagesFor } from '../shared/i18n';

// Errors are thrown with their English and a message key (#64). The app shows the key's words,
// so the English in the code and the message file must say the same thing: read every throw
// and compare its English, placeholders and all, with the message file.

const root = join(__dirname, '../../../..');
const folders = ['packages/store/src', 'packages/core/src/import', 'apps/desktop/src/main'];
const errors = (messagesFor('en') as { errors: Record<string, string> }).errors;

interface Throw {
  readonly where: string;
  readonly key: string;
  readonly english: string;
  readonly values: readonly string[];
}

/** The English of a message argument with `{{name}}` for each `${…}`, matched to the values. */
function englishOf(node: ts.Expression, names: Map<string, string>): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return englishOf(node.expression, names);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = englishOf(node.left, names);
    const right = englishOf(node.right, names);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      const name = names.get(span.expression.getText()) ?? '?';
      text += `{{${name}}}${span.literal.text}`;
    }
    return text;
  }
  return null;
}

function throwsIn(file: string): Throw[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: Throw[] = [];
  const visit = (node: ts.Node): void => {
    const isThrow =
      (ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        /^(StoreError|ImportError)$/.test(node.expression.text)) ||
      // An error subclass's super(code, message, words).
      (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword);
    if (isThrow && node.arguments) {
      const [, message, words] = node.arguments;
      if (message && words && ts.isObjectLiteralExpression(words)) {
        const prop = (name: string) =>
          words.properties.find(
            (p): p is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
              (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
              p.name.getText() === name,
          );
        const key = prop('key');
        const values = prop('values');
        // value expression -> placeholder name
        const names = new Map<string, string>();
        if (values && ts.isPropertyAssignment(values)) {
          const object = values.initializer;
          if (ts.isObjectLiteralExpression(object)) {
            for (const p of object.properties) {
              if (ts.isShorthandPropertyAssignment(p)) names.set(p.name.text, p.name.text);
              if (ts.isPropertyAssignment(p)) names.set(p.initializer.getText(), p.name.getText());
            }
          }
        }
        if (key && ts.isPropertyAssignment(key) && ts.isStringLiteral(key.initializer)) {
          const english = englishOf(message, names);
          if (english !== null) {
            const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            found.push({
              where: `${file.slice(root.length + 1)}:${line}`,
              key: key.initializer.text,
              english,
              values: [...names.values()],
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const all = folders.flatMap((folder) =>
  readdirSync(join(root, folder))
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .flatMap((f) => throwsIn(join(root, folder, f))),
);

describe("errors' English and the message file agree", () => {
  it('finds the throws', () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it.each(all.map((t) => [t.where, t] as const))('%s', (_where, t) => {
    expect(t.key.startsWith('errors.')).toBe(true);
    expect(errors[t.key.slice('errors.'.length)]).toBe(t.english);
  });
});
