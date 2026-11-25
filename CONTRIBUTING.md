# Contributing to tScore

Thanks for helping. tScore is maintained by volunteers for volunteers, so the rules below are
about keeping it **stable, simple and cheap to support**.

## Ways to help

- **Report a problem:** use the _Bug report_ issue form and attach the app's "Report a problem"
  zip if you have one. Don't post rider names or photos of cards with names on them.
- **Suggest a feature:** use the _Idea or feature request_ form, or, without a GitHub account,
  tScore's **About → Suggest a feature** or the questions in
  [docs/suggest-a-feature.md](docs/suggest-a-feature.md).
- **Request a new card type, label stock or region:** use the matching issue form. Most of
  these become data files in `presets/`, not code.
- **Code and docs:** pick an issue labelled `good first issue` or `help wanted`, or open an
  issue to discuss a bigger change first.

## Getting started

```sh
git clone https://github.com/offdarecord/tScore.git
cd tScore
npm install
npm start
```

No native build tools are needed. Use Node.js 24 LTS (`.nvmrc`).

## Pull requests

- Branch from `main`; open a PR; PRs are **squash-merged**.
- **The PR title must follow [Conventional Commits](https://www.conventionalcommits.org/)**,
  because it becomes the changelog line:
  - `feat: scan desk shows the rider's class`
  - `fix: labels skip the last row on partly used sheets`
  - `docs:`, `test:`, `refactor:`, `perf:`, `build:`, `ci:`, `chore:`
  - Add `!` for breaking changes (`feat!: ...`), e.g. an older tScore can no longer open new
    event files, or the results format changes incompatibly.
- Write the title for a club volunteer, not a developer, where it's user-facing.

### Definition of done (every change)

- TypeScript `strict`; lint and format clean (`npm run check`); no `any` in `core` or `vision`.
- Unit tests for logic; an end-to-end test (`apps/desktop/e2e/`, `npm run test:e2e`) for each
  screen or user journey touched, passing the automated accessibility check.
- New user-facing errors have an entry in the error catalogue (`packages/core/src/errors.ts`):
  a public code (`TS-<AREA>-<NNN>`), what it means and what to do. Run `npm run gen:errors` to
  update the guide's error-code page. Key steps write diagnostic log lines (no rider names in
  diagnostic logs).
- The user guide (`docs/guide/`) changes in the same pull request as the behaviour it
  describes: a new screen gets its section and an entry in `help/topics.ts`, so **Help** and F1
  open it. Write by task, in the desk's words, naming buttons exactly as the screen does.
  Changing a recorded decision means a new ADR in `docs/adr/`.
- CI green on Windows.

## Releasing (maintainers)

Releases are cut with the `/cut-release` Claude Code skill
([`.claude/skills/cut-release/SKILL.md`](.claude/skills/cut-release/SKILL.md)), which can also be
followed by hand. In short:

1. release-please keeps a release PR open (`chore(main): release X.Y.Z`). Only `feat:`, `fix:`,
   `perf:` and `revert:` changes produce one.
2. Just before releasing, reword its changelog entry for volunteers, in `CHANGELOG.md` and the
   PR body. release-please acts as a small GitHub App so that CI runs on the release PR
   ([setup](docs/maintainers/release-app.md)); without it, close and reopen the PR to start CI.
3. When CI is green, squash-merge it. CI builds the installer and attaches it to the GitHub
   Release; check the release has the `.exe`, `.blockmap` and `latest.yml`.

Version 1.0.0 is reserved for the first release that fully replaces spreadsheet scoring at a
club event. Until then versions are 0.x.

## Privacy: never commit

- Real entry lists, rider names, licence numbers, contact or medical details.
- Card photos that show names. Re-shoot cards with a synthetic label instead.
- Scoring workbooks from other products, code extracted from them, or anything copied from
  their layouts or printed designs. tScore implements public trials rules from its own design.
- Third-party videos or images you don't have rights to.

`.gitignore` blocks common spreadsheet and database files, but you are responsible for what
you commit.

## Licensing of contributions

By contributing, you agree that your contribution is licensed under the project licence:
Apache-2.0 for code, MIT for `schemas/`, CC BY 4.0 for `docs/`. No contributor agreement is
needed.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
