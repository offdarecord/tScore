// After the installer is signed, its bytes change, so the auto-update metadata built with it
// no longer matches: latest.yml's sha512 and size, and the .blockmap used for small
// downloads. This rewrites both for the signed installer (code signing, docs/maintainers/
// code-signing.md). Installed copies refuse an update whose sha512 doesn't match.
//
//   node scripts/refresh-update-info.mjs apps/desktop/release

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/refresh-update-info.mjs <release folder>');
  process.exit(1);
}
const installers = readdirSync(dir).filter((f) => /^tScore-Setup-.+\.exe$/.test(f));
if (installers.length !== 1) {
  console.error(`Expected one installer in ${dir}, found ${installers.length}.`);
  process.exit(1);
}
const exe = installers[0];
const path = join(dir, exe);
const bytes = readFileSync(path);
const sha512 = createHash('sha512').update(bytes).digest('base64');
const size = statSync(path).size;

// A fresh blockmap for the signed file, with electron-builder's own code (same format as the
// build's). Its path is internal to app-builder-lib, whose version the lockfile pins.
const require = createRequire(join(process.cwd(), 'apps/desktop/package.json'));
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap.js');
await buildBlockMap(path, 'gzip', `${path}.blockmap`);

const ymlPath = join(dir, 'latest.yml');
const yml = readFileSync(ymlPath, 'utf8');
const updated = yml
  .split('\n')
  .map((line) => {
    if (/^\s*sha512: /.test(line)) return line.replace(/sha512: .*/, `sha512: ${sha512}`);
    if (/^\s*size: /.test(line)) return line.replace(/size: .*/, `size: ${size}`);
    return line;
  })
  .join('\n');
if (!updated.includes(`url: ${exe}`) || !updated.includes(`path: ${exe}`)) {
  console.error(`latest.yml doesn't name ${exe}; not changing it.`);
  process.exit(1);
}
writeFileSync(ymlPath, updated);
console.log(`Updated latest.yml and ${exe}.blockmap for the signed installer (${size} bytes).`);
