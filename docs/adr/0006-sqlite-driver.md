# 0006. SQLite driver: `node:sqlite` preferred, `better-sqlite3` fallback

- **Status:** Accepted (2026-11-23, with the event store)
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

## Confirmation (2026-11-23)

The event store (`packages/store`) is built on `node:sqlite`. Checked with Node 24.20 and
with Electron 45.4.1's own runtime (Node 24.22.3, SQLite 3.54.1):

- WAL with `synchronous=FULL`, foreign keys, `STRICT` tables and triggers all work.
- **Kill test passes:** a child process recording cards is killed mid-stream. The file then
  passes `quick_check`, and holds every card reported saved and no half card. It runs in CI
  with Node; it was also run once by hand with Electron's runtime.
- **Backups use `VACUUM INTO`** rather than the async `backup()` function. It makes a
  consistent copy inside SQLite, synchronously, which keeps the store's API synchronous. Event
  files are small (a few MB), so the brief pause doesn't matter.

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
