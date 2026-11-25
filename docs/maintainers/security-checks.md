# Security checks

How known vulnerabilities in tScore and the libraries it ships are found, and what to do about
each kind of alert.

| What                                                                   | Checked by                                                          | When                                | You hear about it as                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| tScore's own code, and the CI workflows                                | **CodeQL** (GitHub code scanning, default setup)                    | Every pull request, and weekly      | A failed check on the pull request; the **Security → Code scanning** tab                |
| npm libraries (React, Mantine, Electron's own advisories, build tools) | **Dependabot alerts** and **security updates**                      | As soon as an advisory is published | An alert email, and a Dependabot pull request with the fix                              |
| The same, on every change                                              | `npm run check:audit` in CI                                         | Every pull request                  | A failed **Lint, types, tests** check                                                   |
| Electron's Chromium and Node                                           | `npm run check:electron` in CI, and the weekly **Dependency watch** | Every pull request; Mondays         | A failed check once Electron is out of support; an **Electron watch** issue before that |
| SheetJS (`xlsx`)                                                       | Weekly **Dependency watch**                                         | Mondays                             | A **SheetJS x.y.z is out** issue                                                        |
| Secrets (passwords, keys)                                              | GitHub secret scanning with push protection                         | Every push                          | The push is refused                                                                     |

Library updates that aren't security fixes come from Dependabot's weekly version updates
(`.github/dependabot.yml`).

## Why Electron needs its own check

tScore runs on Electron, which ships its own copy of Chromium and Node. Most security fixes for
tScore's runtime are Chromium and Node fixes, and they reach tScore only as new Electron releases,
not as advisories the scanners can see. Electron fixes security problems only in its **three
newest stable majors**, and a new major ships about every 8 weeks, so each major gets about six
months of fixes.

- **Minor and patch releases** carry those fixes. Dependabot opens a pull request weekly: merge
  it promptly.
- **Majors** are upgraded by hand (ADR 0002). The Electron watch opens an issue when a new major
  is out, warns (with an expected date) when tScore's major is the oldest still supported, and
  marks the issue **Urgent** once it isn't. From then on, `check:electron` fails CI, so a release
  can't go out on an unsupported Electron.

## When `check:audit` fails

It fails on **high or critical** advisories in any library, including dev dependencies, because
the build bundles Electron, React and Mantine into the installer. Moderate and low ones are
printed as notes.

1. Look at the advisory link. Usually `npm update <package>`, or the Dependabot pull request,
   fixes it.
2. If no fix exists yet and the package truly can't reach users (a build-only tool, say), add an
   exception to `.github/audit-exceptions.json`: the `GHSA-…` id, the reason, and an `until`
   date no more than three months away. CI fails again after that date, so the decision is
   revisited.

```json
{
  "id": "GHSA-xxxx-xxxx-xxxx",
  "reason": "electron-builder only, at build time; no fix yet",
  "until": "2027-02-28"
}
```

## When the SheetJS issue opens

SheetJS publishes only on its own site (the npm copy is old and has known problems), so nothing
else tracks it. The issue lists the steps: read the changelog, change the URL in
`packages/store/package.json`, `npm install`, and run the import tests.

## Reporting a vulnerability

See [SECURITY.md](../../SECURITY.md): privately, through GitHub's security advisories.
