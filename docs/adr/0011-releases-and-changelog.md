# 0011. Conventional Commits, release-please, SemVer

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

Every version needs a changelog that volunteers can read. Releases must be repeatable by any
maintainer, and clubs must get fixes without manual reinstalls, but never mid-event.

## Decision

- **Semantic Versioning.** MAJOR: an older tScore can no longer open new event files, or the
  results format breaks. MINOR: features. PATCH: fixes.
- **Conventional Commits** on PR titles (`feat:`, `fix:`, `perf:`, `docs:`, `chore:`,
  `feat!:` for breaking), checked in CI. PRs are **squash-merged**, so the title is the commit.
- **release-please** keeps a release PR open with the next version and the generated
  `CHANGELOG.md` entry. Merging it tags the version; CI then builds (and, once set up, signs)
  the installer and publishes it to **GitHub Releases** with the update metadata.
- Before merging a release PR, a maintainer rewrites the wording for volunteers
  (`/cut-release` skill). Changelog sections include **Event files** and **Results format**
  whenever those change.
- **Channels:** `beta` (opt-in pre-releases) and `stable`. Auto-update only when online and no
  event is open. Only the latest stable gets fixes.
- **Code signing:** installers are unsigned until signing (SignPath Foundation or Azure
  Trusted Signing) is in place; the workflow has a placeholder step.

## Consequences

- The changelog writes itself from merged PR titles; humans only polish wording.
- Contributors must use Conventional Commit PR titles (CI tells them how).

## Alternatives considered

- **Hand-written changelog:** forgotten under time pressure.
- **semantic-release:** publishes on every merge; release-please's release PR gives a human
  checkpoint, which suits volunteer releases.
