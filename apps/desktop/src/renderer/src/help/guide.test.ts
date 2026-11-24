import { ERROR_CATALOGUE, errorAnchor } from '@tscore/core';
import { describe, expect, it } from 'vitest';
import { CONTENTS, GUIDE, guideImage } from './guide';
import { linksIn, resolveLink } from './markdown';
import { HELP_TOPICS } from './topics';

const anchors = (page: string) => new Set(GUIDE.get(page)?.headingIds.values() ?? []);

/** Why a page and heading can't be reached, or null if it can. */
function broken(page: string, anchor?: string): string | null {
  if (!GUIDE.has(page)) return `no page ${page}.md`;
  if (anchor && !anchors(page).has(anchor)) return `no heading #${anchor} on ${page}.md`;
  return null;
}

describe('user guide', () => {
  it('is built into the app, with a contents page', () => {
    expect(GUIDE.size).toBeGreaterThan(5);
    expect(GUIDE.has(CONTENTS)).toBe(true);
  });

  it('gives every page a title', () => {
    for (const page of GUIDE.values()) expect(page.title, page.id).not.toBe(page.id);
  });

  it('lists every page on the contents page', () => {
    const listed = new Set(
      linksIn(GUIDE.get(CONTENTS)?.tokens ?? []).links.map((href) => {
        const t = resolveLink(CONTENTS, href);
        return t.kind === 'page' ? t.page : href;
      }),
    );
    const missing = [...GUIDE.keys()].filter((id) => id !== CONTENTS && !listed.has(id));
    expect(missing).toEqual([]);
  });

  it('has no broken links or missing images', () => {
    const problems: string[] = [];
    for (const page of GUIDE.values()) {
      const { links, images } = linksIn(page.tokens);
      for (const href of links) {
        const t = resolveLink(page.id, href);
        if (t.kind === 'other') problems.push(`${page.id}.md: ${href} isn't a guide page or https`);
        if (t.kind === 'page') {
          const why = broken(t.page, t.anchor);
          if (why) problems.push(`${page.id}.md: ${href}: ${why}`);
        }
      }
      for (const src of images) {
        if (!guideImage(src))
          problems.push(`${page.id}.md: image ${src} not in docs/guide/images/`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('has a page and heading for every screen', () => {
    const problems = Object.entries(HELP_TOPICS).flatMap(([screen, t]) => {
      const why = broken(t.page, 'anchor' in t ? t.anchor : undefined);
      return why ? [`${screen}: ${why}`] : [];
    });
    expect(problems).toEqual([]);
  });

  it('has an entry for every error code', () => {
    const missing = ERROR_CATALOGUE.filter((e) => broken('errors', errorAnchor(e.code)));
    expect(missing.map((e) => e.code)).toEqual([]);
  });
});
