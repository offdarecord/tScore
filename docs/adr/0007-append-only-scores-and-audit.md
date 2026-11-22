# 0007. Append-only score versions and audit log ("event sourcing lite")

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

Every result must be traceable to a card image and a log of who changed what and why.
Spreadsheet scoring overwrites values, so history is lost. Full event sourcing would be too
much machinery for volunteer contributors.

## Decision

- Section scores are **versioned rows**: a correction inserts a new version (value, source,
  confidence, reason, operator, time) and marks the old one `superseded_by`. Nothing is
  updated in place or deleted.
- An **append-only `audit_event` table** records every data change (scan, edit, penalty,
  status change, class change, config change).
- Every record carries a **UUID** and a **station id**, so a second scanning station can be
  added later without key clashes.
- Current state is read from ordinary tables/views; we do not rebuild state by replaying events.

## Consequences

- Undo and "who changed this?" are straightforward.
- Edits always require a reason in the UI.
- Slightly more storage; negligible at event scale.

## Alternatives considered

- **Overwrite in place:** loses history (the problem we are replacing).
- **Full event sourcing:** replay, projections and snapshots are too complex for the team.
