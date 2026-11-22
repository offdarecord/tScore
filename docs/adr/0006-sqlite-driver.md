# 0006. SQLite driver: `node:sqlite` preferred, `better-sqlite3` fallback

- **Status:** Proposed (confirm at the start of Phase 2, when the event store is built)
- **Date:** 2026-11-22

## Context

[ADR 0005](0005-sqlite-one-file-per-event.md) chose SQLite. Contributors must not need native
build tools (Visual Studio Build Tools, Xcode), and native Node modules must be rebuilt for
every Electron upgrade.

Checked on 2026-11-22 with Electron 45.4.1 (bundled Node 24.22.3):

- `require('node:sqlite')` loads in the main process with no flags.
- `DatabaseSync` opens databases; bundled SQLite is **3.54.1**.
- The online **`backup()`** function is available (needed for rolling backups).
- In Node 24 the module's stability is _release candidate_, not yet _stable_.

## Decision

- **Use Node's built-in `node:sqlite`** (`DatabaseSync`) in the main process, behind a small
  `EventStore` interface so the driver can be swapped without touching callers.
- **Fallback:** `better-sqlite3` with prebuilt Electron binaries, rebuilt only in CI, if
  `node:sqlite` shows a blocking gap (WAL/`synchronous=FULL` behaviour under the kill tests,
  backup API, performance) or regresses in an Electron upgrade.
- Re-check `node:sqlite` stability status at the start of Phase 2 and on each Electron major
  upgrade; mark this ADR Accepted (or supersede it) then.

## Consequences

- No native module: `npm install` needs no compiler and Electron upgrades need no rebuild.
- We depend on Electron's bundled SQLite version; it is recorded in diagnostic logs.
- The kill-mid-commit and soak tests (Phase 2) are the acceptance test for the driver.

## Alternatives considered

- **`better-sqlite3`:** mature and fast, but a native module: rebuilt per Electron version,
  prebuilt binaries can lag new Electron releases, and contributors on unusual setups hit
  compiler errors.
- **sql.js (WASM):** in-memory; would have to write the whole file on each save, losing
  SQLite's crash safety.
