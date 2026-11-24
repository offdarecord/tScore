import { parsePage, type GuidePage } from './markdown';

/**
 * The user guide (`docs/guide/`), built into the app so help works with no internet. The same
 * files are what GitHub shows.
 */
const sources = import.meta.glob<string>('../../../../../../docs/guide/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const imageUrls = import.meta.glob<string>(
  '../../../../../../docs/guide/images/*.{png,jpg,jpeg,svg,webp}',
  { import: 'default', eager: true },
);

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export const GUIDE: ReadonlyMap<string, GuidePage> = new Map(
  Object.entries(sources).map(([path, md]) => {
    const id = fileName(path).replace(/\.md$/, '');
    return [id, parsePage(id, md)] as const;
  }),
);

/** The contents page (`docs/guide/README.md`). */
export const CONTENTS = 'README';

/** The URL of an image a page refers to (`images/foo.png`), if the image exists. */
export function guideImage(href: string): string | undefined {
  const m = /^(?:\.\/)?images\/([^/]+)$/.exec(href);
  if (!m) return undefined;
  const entry = Object.entries(imageUrls).find(([path]) => fileName(path) === m[1]);
  return entry?.[1];
}
