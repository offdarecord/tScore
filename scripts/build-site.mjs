// Builds the project website (GitHub Pages) into _site/: the page in site/, the README and
// tour pictures from docs/media/, the banner, and the icons from the app icon. The Pages workflow runs it; locally:
//
//   npm run site      then open _site/index.html

import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSiteIcons } from './site-icons.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'media'), { recursive: true });
cpSync(join(root, 'site'), out, { recursive: true });
for (const f of readdirSync(join(root, 'docs/media')).filter((f) => f.endsWith('.png'))) {
  cpSync(join(root, 'docs/media', f), join(out, 'media', f));
}
cpSync(join(root, 'assets/tscore-banner.jpg'), join(out, 'media/banner.jpg'));
// The browser tab, bookmark and home-screen icons, from the app icon (#116).
writeSiteIcons(root, out);
console.log('Built _site/');
