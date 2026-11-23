---
name: cut-release
description: Ship a tScore release. Finds release-please's open release PR, rewrites the changelog for club volunteers, checks event-file and results-format notes, gets CI to run, merges only after the maintainer confirms, then verifies the published installer and update metadata and drafts a short announcement. Use when a maintainer says "cut a release", "ship it", "publish the next version" or runs /cut-release.
disable-model-invocation: true
---

# /cut-release

Publishing a release is **outward-facing and hard to undo**: it creates a public tag, a GitHub
Release and an installer that every installed copy of tScore will auto-update to. Never merge
the release PR without the maintainer's explicit "yes" in this conversation, after showing them
the version and the final release notes.

Background: [ADR 0011](../../../docs/adr/0011-releases-and-changelog.md). release-please keeps a
release PR open on branch `release-please--branches--main--components--tScore` with label
`autorelease: pending`. Merging it tags `vX.Y.Z`, creates the GitHub Release (notes = the PR
body), and `.github/workflows/release.yml` builds the installer and attaches it.

Use the **Bash** tool for `gh ... --jq` commands; Windows PowerShell 5.1 mangles their quoting.

## 1. Preconditions

```sh
gh auth status
git -C <repo> status --porcelain        # must be empty
git -C <repo> fetch origin
gh run list --repo offdarecord/tScore --branch main --limit 3   # latest CI on main must be success
```

Stop and tell the maintainer if CI on `main` is failing.

## 2. Find the release PR

```sh
gh pr list --repo offdarecord/tScore --label "autorelease: pending" --state open \
  --json number,title,headRefName --jq '.[] | "\(.number) \(.title)"'
```

- **None open:** nothing to release. Only `feat:`, `fix:`, `perf:` and `revert:` PRs produce
  a release; `docs:`, `chore:`, `ci:`, `build:`, `test:` and `refactor:` do not. Say so and stop.
- Read the proposed version from the title (`chore(main): release X.Y.Z`).

## 3. Sanity-check the version

- **Pre-1.0:** tScore's **1.0.0 is reserved for the R1 finish line.** If the PR proposes
  `1.0.0` or higher and the maintainer has not said "this is 1.0", stop and ask.
- A **major** bump after 1.0 means an older tScore can no longer open new event files, or the
  results format broke. Confirm that is intended.

## 4. Review what's in it

```sh
gh pr view <N> --repo offdarecord/tScore --json body --jq .body
git -C <repo> log --oneline <previous-tag>..origin/main
git -C <repo> diff --stat <previous-tag>..origin/main -- schemas/ packages/core/src/migrations/
```

- If `schemas/tscore.results.v*.schema.json` changed: the notes need a **Results format**
  section saying what changed and whether consumers (e.g. trials.au) must act. A breaking change
  needs a new major schema id (`/2`) and consumers told _before_ release.
- If the event-file schema or migrations changed: the notes need an **Event files** section
  ("Events created with this version can't be opened by versions before X.Y.Z" when true).
- Hidden sections (`docs`, `chore`, `ci`, `build`, `test`, `refactor`) don't appear; that's
  intended.

## 5. Rewrite the notes for volunteers

Draft new wording and **show it to the maintainer before committing**. Rules:

- Audience: a club secretary or results-desk volunteer, not a developer. Plain Australian
  English. Say what they'll notice and what (if anything) they must do.
- Keep the version heading and date line release-please wrote. Keep the sections **Added**,
  **Changed**, **Fixed**, plus **Event files** and **Results format** when relevant.
- One line per change; keep the PR links. Merge lines that are one user-visible change.
- Remove developer-only noise that slipped into visible sections.
- **Privacy:** no rider names, club member names, licence numbers or real event details.

Apply the same text in **both** places, on the release PR branch:

1. `CHANGELOG.md`: replace the new version's entry only (leave older entries untouched).
2. The PR body: replace only the release notes between the first `---` and the last `---`
   lines (keep release-please's header and footer). The GitHub Release notes are taken from
   the PR body.

```sh
git -C <repo> switch release-please--branches--main--components--tScore
git -C <repo> pull --ff-only
# edit CHANGELOG.md
git -C <repo> commit -am "docs: reword release notes for volunteers"
git -C <repo> push
gh pr edit <N> --repo offdarecord/tScore --body-file <file with the full new body>
git -C <repo> switch main
```

Do this **last, just before merging**: if anything else merges to `main` meanwhile,
release-please regenerates the PR and the edits are lost. Check `origin/main` hasn't moved
before merging; if it has, redo this step.

## 6. Get CI to run

release-please updates the release PR as the tScore Release GitHub App
([docs/maintainers/release-app.md](../../../docs/maintainers/release-app.md)), so CI and the PR
title check start on their own, and again when you push the reworded changelog (step 5). If the
app isn't set up, release-please falls back to the workflow token and GitHub starts nothing on
the PR: check that `gh pr checks <N>` lists all the required checks, and if any are missing,
close and reopen the PR:

```sh
gh pr close <N> --repo offdarecord/tScore && gh pr reopen <N> --repo offdarecord/tScore
```

Wait for the required checks (`Lint, types, tests`, `App end-to-end`, `Windows installer`,
`conventional-title`)
in the background (`gh pr checks <N> --repo offdarecord/tScore --watch`). If any fail, stop and
report; don't merge around them.

## 7. Confirm, then merge

Show the maintainer: version, final release notes, and that CI is green. Remind them the
installer is unsigned until code signing is set up (SmartScreen will warn). Ask for an explicit
yes. Only then:

```sh
gh pr merge <N> --repo offdarecord/tScore --squash
```

## 8. Verify the published release

Watch the `Release` workflow run on `main` to completion:

```sh
gh run list --repo offdarecord/tScore --workflow release.yml --branch main --limit 1
gh run watch <run-id> --repo offdarecord/tScore --exit-status
```

Then check the release:

```sh
gh release view vX.Y.Z --repo offdarecord/tScore --json isDraft,isPrerelease,assets \
  --jq '.isDraft, .isPrerelease, [.assets[].name]'
gh release download vX.Y.Z --repo offdarecord/tScore --pattern latest.yml --dir <scratch dir>
```

Pass only if:

- not a draft;
- assets are exactly `tScore-Setup-X.Y.Z.exe`, `tScore-Setup-X.Y.Z.exe.blockmap`, `latest.yml`;
- `latest.yml` says `version: X.Y.Z` and `path: tScore-Setup-X.Y.Z.exe`, with a `sha512`.

If the installer job failed, the tag and release exist without assets: report it, fix the
cause, and re-run the failed job (`gh run rerun <run-id> --failed`). Never delete a published
tag without the maintainer's say-so.

## 9. Verify auto-update (when a previous release exists)

This installs software, so **ask first**. On a Windows machine with the previous version
installed, start tScore while online with no event open, wait about a minute, then quit. Check
`%APPDATA%\tScore\logs\main.log` for the update being found and downloaded; start tScore again
and confirm Help → About shows X.Y.Z. If the maintainer prefers, give them these steps instead
of doing it.

## 10. Draft an announcement

Write 3–5 plain sentences for the trials.au tScore page or a club email: what's new for clubs,
anything they must do, the download link
(`https://github.com/offdarecord/tScore/releases/tag/vX.Y.Z`). **Don't post or send it**;
hand it to the maintainer.

## Finish

Report: version, release link, verification results (and anything skipped), and the draft
announcement.
