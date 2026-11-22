# 0005. SQLite, one file per event; JSON for export

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

A confirmed card must never be lost, even if the laptop loses power mid-scan. An event must
be movable between laptops mid-event. The Progress and Audit screens need queries such as
"which laps are missing".

## Decision

- Each event is **one folder**: `event.sqlite`, `cards/` (card images), `exports/`, `backups/`.
- `event.sqlite` runs in **WAL mode with `synchronous=FULL`**. Each confirmed card is written
  in **one transaction before** the OK sound plays.
- `PRAGMA quick_check` on open; rolling backups via SQLite's online backup API.
- Each event file carries a **schema version**. A newer app backs the file up, then migrates
  it forward on open. Migrations are tested in CI against files from every earlier release.
- **JSON** is the export, interchange and human-readable backup format, never the live store.

## Consequences

- Atomic writes; a power cut cannot leave a half-written card.
- Nothing to install; the same file works on any OS.
- We maintain a migration chain from day one.

## Alternatives considered

- **JSON files as the live store:** every save rewrites the file; crash mid-write corrupts it.
- **Server database:** too much to install and run on a club laptop.

See [0006](0006-sqlite-driver.md) for the driver.
