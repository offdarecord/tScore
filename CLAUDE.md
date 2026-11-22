# tScore: guide for AI assistants and contributors

tScore is an open-source (Apache-2.0) Windows desktop app for scoring motorcycle trials, with
punched-card scanning by USB document camera. It runs fully offline at venues with no internet,
is used by non-technical volunteers, and is maintained by part-time volunteers. Optimise for
**stability, simplicity and low support cost**.

## Read first

- `docs/adr/`: settled decisions. Don't re-argue them; if one must change, write a new ADR that
  supersedes it.
- `CONTRIBUTING.md`: PR rules and the Definition of Done.

## Layout

- `packages/core`: event model, scoring, ranking, results. **Pure TypeScript: no Electron, no
  Node-only APIs, no I/O.** Deterministic functions, heavily unit- and property-tested.
- `packages/vision`: card reading. **Pure TypeScript**; must run in Node (bench, CI) and in a
  Web Worker. No OpenCV, no WASM, no native modules (ADR 0003).
- `apps/desktop`: Electron. `src/main` (main process), `src/preload` (bridge), `src/renderer`
  (React + Mantine), `src/shared` (IPC contract).
- `schemas/` (MIT): JSON Schemas, the source of truth for file formats; types are generated from them.
- `presets/`: regional data (class lists, rulesets, label templates, card profiles).
- `fixtures/`: anonymised test data only.
- `.claude/skills/`: maintainer workflows.

## Commands

- `npm install`, `npm start` (dev app), `npm test`, `npm run check` (lint + format + types + tests),
  `npm run test:e2e` (launch the real app with Playwright, incl. an axe accessibility check),
  `npm run dist` (Windows installer).
- Run `npm run check` before declaring work done, and `npm run test:e2e` when any screen changed.
- Every screen or user journey gets an end-to-end test in `apps/desktop/e2e/` that clicks through
  it, plus the axe check. Features not built yet use `ComingSoonButton`, never a bare disabled
  button.

## Conventions

- TypeScript `strict`; ES modules; no `any` in `core`/`vision`.
- In `packages/*`, use `.js` extensions on relative imports.
- **Electron security baseline (ADR 0010):** context isolation on, Node integration off,
  sandboxed renderer, no remote content, strict CSP. New IPC goes through `src/shared/ipc.ts`
  first; main validates the sender of every message. Never expose `ipcRenderer` or Node APIs
  to the renderer.
- **UI (ADR 0009):** Mantine components only; tokens in `theme.ts`; keyboard-first (show the
  key on the button); undo rather than "Are you sure?" for reversible actions; plain
  Australian English; designed empty/loading/error states.
- **Data (ADR 0005, 0007):** one SQLite file per event; scores are versioned, never updated in
  place; every data change writes an `audit_event`; every edit needs a reason.
- **Errors and logs (ADR 0012):** user-facing errors get a `TS-<AREA>-<NNN>` code and a
  catalogue entry. The diagnostic log never contains rider names (numbers and ids only).
- **Commits/PRs:** Conventional Commits PR titles (`feat:`, `fix:`, `docs:` …); squash merge;
  never push to `main`; work on a branch and open a PR.

## Privacy and IP rules (hard rules)

- **Never commit or send to outside services:** real entry lists, rider names, licence
  numbers, DOB/address/phone/medical data, card photos showing names, third-party videos.
- **Never read from, copy from, or reference paths in the private planning folder** (anything
  under a OneDrive `Trials` directory, or folders named `samples/` or `reference/` outside this
  repo) unless the maintainer explicitly asks, and even then never copy its data files here.
- **Never copy** code, formulas, VBA, sheet layouts or printed designs from any commercial
  scoring workbook. Implement public trials rules from our own design.
- Fixtures must be anonymised (synthetic names, re-shot cards with synthetic labels).
- Importers read only scoring fields (name, class, club, number, competitive, licence no.).

## Domain quick reference

- Score values (default ruleset): 0 clean, 1/2/3 dabs, 5 fail.
- Ranking within class: tier (competitive → No Award → non-competitive), then total ascending
  (descending for gate trials), then most 0s, 1s, 2s, 3s, fewest 5s, then ride-off.
- Row decoding: 1 hole = that value; all-but-one holes = the unpunched value (`INVERSE`);
  0 holes = `NO_PUNCH`; otherwise `MULTI_PUNCH`. A missed section is always flagged, never
  auto-scored. A wrong auto-accept is the expensive error; unnecessary reviews are cheap.
- Rider numbers never move once issued; withdrawn numbers are never reused.
