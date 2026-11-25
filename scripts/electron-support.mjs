// Is tScore's Electron still getting security fixes? Electron fixes security problems only in
// its three newest stable major versions, and a new major ships about every 8 weeks, so a
// version drops out of support about 6 months after its release. Most of tScore's runtime
// security fixes (Chromium, Node) arrive only as new Electron releases, which the
// vulnerability scanners don't report. See docs/maintainers/security-checks.md.
//
//   node scripts/electron-support.mjs           CI: fail if Electron is no longer supported
//   node scripts/electron-support.mjs --report  weekly watch: write the findings as JSON

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SUPPORTED_MAJORS = 3;
const RELEASE_GAP_DAYS = 56; // a new major about every 8 weeks
const FEED = 'https://releases.electronjs.org/releases.json';

const major = (v) => Number(v.split('.')[0]);
const stable = (v) => /^\d+\.\d+\.\d+$/.test(v);
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

/**
 * What needs doing, given the installed version and Electron's release list
 * ({ version, date }[]). Pure, for the tests.
 */
export function assess(installed, releases) {
  const versions = releases.filter((r) => stable(r.version));
  const latestMajor = Math.max(...versions.map((r) => major(r.version)));
  const oldestSupported = latestMajor - SUPPORTED_MAJORS + 1;
  const mine = major(installed);
  const latestOfMine = versions
    .filter((r) => major(r.version) === mine)
    .map((r) => r.version)
    .reduce((a, b) => (newer(b, a) ? b : a), installed);
  const latestRelease = versions.find((r) => r.version === `${latestMajor}.0.0`)?.date;
  const nextMajorAbout = latestRelease
    ? new Date(Date.parse(latestRelease) + RELEASE_GAP_DAYS * 864e5).toISOString().slice(0, 10)
    : undefined;

  const findings = [];
  if (mine < oldestSupported) {
    findings.push({
      kind: 'unsupported',
      urgent: true,
      text: `Electron ${mine} no longer gets security fixes. Supported now: ${oldestSupported}–${latestMajor}. Upgrade to ${latestMajor} before the next release.`,
    });
  } else if (mine === oldestSupported) {
    findings.push({
      kind: 'last-supported',
      urgent: false,
      text: `Electron ${mine} is the oldest supported major. It stops getting security fixes when Electron ${latestMajor + 1} ships${nextMajorAbout ? ` (expected around ${nextMajorAbout})` : ''}. Plan the upgrade to ${latestMajor}.`,
    });
  }
  if (latestMajor > mine && mine >= oldestSupported) {
    findings.push({
      kind: 'new-major',
      urgent: false,
      text: `Electron ${latestMajor} is available; tScore is on ${mine}. Majors are upgraded by hand (ADR 0002).`,
    });
  }
  if (newer(latestOfMine, installed)) {
    findings.push({
      kind: 'patch',
      urgent: mine < oldestSupported,
      text: `Electron ${latestOfMine} is out; tScore is on ${installed}. Minor and patch releases carry Chromium and Node security fixes: merge Dependabot's pull request, or update by hand.`,
    });
  }
  return { installed, latestMajor, oldestSupported, supported: mine >= oldestSupported, findings };
}

export function installedElectron() {
  const pkg = JSON.parse(
    readFileSync(new URL('../apps/desktop/package.json', import.meta.url), 'utf8'),
  );
  return String(pkg.devDependencies?.electron ?? pkg.dependencies?.electron).replace(/^[^\d]*/, '');
}

async function main() {
  const report = process.argv.includes('--report');
  let releases;
  try {
    const res = await fetch(FEED);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    releases = await res.json();
  } catch (err) {
    // A feed outage mustn't block every pull request; the weekly watch tries again.
    console.warn(`::warning::Couldn't read Electron's release list (${err.message}); skipped.`);
    if (report) process.exit(1);
    return;
  }
  const result = assess(installedElectron(), releases);
  if (report) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `Electron ${result.installed}: supported majors ${result.oldestSupported}–${result.latestMajor}.`,
  );
  for (const f of result.findings) console.log(`- ${f.text}`);
  if (!result.supported) {
    console.error(`::error::${result.findings[0].text}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
