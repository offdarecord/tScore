// Known vulnerabilities in every library tScore uses, including "dev" ones: Electron, React
// and Mantine are dev dependencies here because the build bundles them into the installer.
// Fails on high or critical advisories unless .github/audit-exceptions.json lists them with a
// reason and an expiry date. Moderate and low ones are reported, not failed.
// See docs/maintainers/security-checks.md.
//
//   node scripts/audit.mjs

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FAIL_ON = new Set(['high', 'critical']);

/** The advisories in `npm audit --json` output, one per advisory and package. */
export function advisories(audit) {
  const out = new Map();
  for (const [name, v] of Object.entries(audit.vulnerabilities ?? {})) {
    for (const via of v.via) {
      if (typeof via === 'string') continue; // reached through another package; listed there
      const id = via.url?.split('/').pop() ?? String(via.source);
      out.set(`${id} ${name}`, {
        id,
        name,
        severity: via.severity,
        title: via.title,
        url: via.url,
        range: via.range,
      });
    }
  }
  return [...out.values()];
}

/** Which advisories fail the check, given the exceptions and today's date (YYYY-MM-DD). */
export function judge(found, exceptions, today) {
  const failing = [];
  const excepted = [];
  const expired = exceptions.filter((e) => e.until < today);
  for (const a of found) {
    if (!FAIL_ON.has(a.severity)) continue;
    const ex = exceptions.find((e) => e.id === a.id && e.until >= today);
    (ex ? excepted : failing).push(ex ? { ...a, reason: ex.reason, until: ex.until } : a);
  }
  return { failing, excepted, expired, notes: found.filter((a) => !FAIL_ON.has(a.severity)) };
}

function main() {
  let raw;
  try {
    raw = execSync('npm audit --json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    raw = err.stdout; // npm audit exits 1 when it finds anything
  }
  const audit = JSON.parse(raw);
  if (audit.error) {
    console.error(`::error::npm audit couldn't run: ${audit.error.summary ?? audit.error.code}`);
    process.exit(1);
  }
  const { exceptions } = JSON.parse(
    readFileSync(new URL('../.github/audit-exceptions.json', import.meta.url), 'utf8'),
  );
  const r = judge(advisories(audit), exceptions, new Date().toISOString().slice(0, 10));

  for (const a of r.notes) console.log(`note: ${a.severity} ${a.name} ${a.id}: ${a.title}`);
  for (const a of r.excepted)
    console.log(`excepted until ${a.until}: ${a.severity} ${a.name} ${a.id}: ${a.reason}`);
  for (const e of r.expired)
    console.error(
      `::error::Audit exception ${e.id} expired on ${e.until}. Fix it, or renew it with a fresh reason.`,
    );
  for (const a of r.failing)
    console.error(`::error::${a.severity} ${a.name} ${a.range ?? ''}: ${a.title} (${a.url})`);

  if (r.failing.length || r.expired.length) {
    console.error(
      'Upgrade the library (npm update, or wait for the Dependabot pull request). If it truly ' +
        "can't reach users, add an exception with a reason and an expiry date to " +
        '.github/audit-exceptions.json.',
    );
    process.exit(1);
  }
  console.log(
    `npm audit: nothing high or critical (${r.notes.length} lower, ${r.excepted.length} excepted).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
