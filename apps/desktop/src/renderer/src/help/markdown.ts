import { Lexer, type Token, type Tokens } from 'marked';

/**
 * The user guide's Markdown, parsed once. Pure (no React, no Vite), so the guide's own tests can
 * check every link and image the app will follow.
 */

/** A heading id as GitHub makes it, so `page.md#some-heading` works on GitHub and in the app. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Plain text of inline tokens (for heading ids and titles). */
export function plainText(tokens: readonly Token[] | undefined): string {
  return (tokens ?? [])
    .map((t) => {
      if ('tokens' in t && t.tokens) return plainText(t.tokens);
      if (t.type === 'html') return '';
      return 'text' in t ? t.text : '';
    })
    .join('');
}

export interface GuidePage {
  /** File name without `.md`: `event-day`. */
  readonly id: string;
  /** The page's first `#` heading. */
  readonly title: string;
  readonly tokens: readonly Token[];
  /** Heading id of each heading token, in order (duplicates get `-1`, `-2` as on GitHub). */
  readonly headingIds: ReadonlyMap<Tokens.Heading, string>;
}

export function parsePage(id: string, markdown: string): GuidePage {
  const tokens = new Lexer({ gfm: true }).lex(markdown);
  const headingIds = new Map<Tokens.Heading, string>();
  const seen = new Map<string, number>();
  let title = id;
  for (const t of tokens) {
    if (t.type !== 'heading') continue;
    const h = t as Tokens.Heading;
    const base = slug(plainText(h.tokens));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    headingIds.set(h, n === 0 ? base : `${base}-${n}`);
    if (h.depth === 1 && title === id) title = plainText(h.tokens);
  }
  return { id, title, tokens, headingIds };
}

/** Where a link in the guide goes. */
export type LinkTarget =
  | { readonly kind: 'page'; readonly page: string; readonly anchor?: string }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'other'; readonly href: string };

/** Resolve a link written in a guide page (all pages sit in one folder). */
export function resolveLink(fromPage: string, href: string): LinkTarget {
  if (/^https:\/\//i.test(href)) return { kind: 'external', url: href };
  if (href.startsWith('#')) return { kind: 'page', page: fromPage, anchor: href.slice(1) };
  const [, page, anchor] = /^(?:\.\/)?([a-z0-9-]+)\.md(?:#(.+))?$/i.exec(href) ?? [];
  if (page) return { kind: 'page', page, ...(anchor && { anchor }) };
  return { kind: 'other', href };
}

/** Every link and image in a page, for checking. */
export function linksIn(tokens: readonly Token[]): { links: string[]; images: string[] } {
  const links: string[] = [];
  const images: string[] = [];
  const walk = (ts: readonly Token[]) => {
    for (const t of ts) {
      if (t.type === 'link') links.push((t as Tokens.Link).href);
      if (t.type === 'image') images.push((t as Tokens.Image).href);
      if ('tokens' in t && t.tokens) walk(t.tokens);
      if (t.type === 'list') walk((t as Tokens.List).items);
      if (t.type === 'table') {
        const table = t as Tokens.Table;
        for (const cell of [...table.header, ...table.rows.flat()]) walk(cell.tokens);
      }
    }
  };
  walk(tokens);
  return { links, images };
}

/** GitHub alert blockquotes (`> [!TIP]`), shown as callouts on GitHub and in the app. */
export type Callout = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';

export function calloutOf(quote: Tokens.Blockquote): { kind: Callout; body: Token[] } | null {
  const m = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/.exec(quote.text);
  if (!m) return null;
  const kind = m[1] as Callout;
  return { kind, body: new Lexer({ gfm: true }).lex(quote.text.slice(m[0].length)) };
}
