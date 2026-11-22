# 0010. Build and test tooling

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

Contributors should be able to `git clone`, `npm install`, `npm start`, with no native build
tools and as few moving parts as possible. CI must produce a Windows installer on every PR.

## Decision

- **npm workspaces** (no extra monorepo tool):
  - `packages/core`: event model, scoring, ranking, results, validation. Pure TypeScript, no Electron.
  - `packages/vision`: card reading. Pure TypeScript; runs in Node and in a Web Worker.
  - `apps/desktop`: Electron main, preload and renderer.
  - `schemas/`, `presets/`, `fixtures/`, `docs/`, `.claude/skills/`.
- **TypeScript** `strict`, ES modules. No `any` in `core` or `vision`.
- **electron-vite** to build main, preload and renderer.
- **electron-builder** (NSIS installer, x64) and **electron-updater** (GitHub Releases).
- **Vitest** for unit tests; **fast-check** for property tests (ranking, tie-breaks);
  **Playwright** for Electron end-to-end tests and screenshots (added with the first real screen).
- **ESLint** (flat config, typescript-eslint) and **Prettier**.
- **Node 24 LTS** for development and CI (`.nvmrc`).
- **Electron security baseline:** context isolation on, Node integration off, sandboxed
  renderer, a typed and validated IPC bridge, no remote content, strict Content Security Policy.
- **CI (GitHub Actions)** on `windows-latest`: lint, type-check, unit tests, PR-title check,
  installer build. Golden events, vision bench, schema validation, fixture personal-data scan
  and end-to-end tests are added as those parts are built.

## Consequences

- Three commands from clone to running app.
- `core` and `vision` tests run in plain Node in seconds.
- TypeScript is pinned to the newest version supported by typescript-eslint.

## Alternatives considered

- **Turborepo / Nx / pnpm:** extra tools for contributors to learn; not needed at this size.
- **Electron Forge:** viable; electron-builder + electron-updater is the more common
  pairing for NSIS installers with GitHub Releases updates.
- **Jest:** slower and needs more configuration with ES modules than Vitest.
