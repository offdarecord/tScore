# 0012. Separate audit and diagnostic logs; error codes

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

Clubs run events offline and cannot screen-share with a maintainer. When something goes
wrong, a maintainer needs enough information to diagnose it, without receiving riders'
personal data.

## Decision

- **Two logs, never mixed:**
  - **Audit log:** what happened to the event's data; `audit_event` table in `event.sqlite`;
    kept forever; contains names (it _is_ the event). See [0007](0007-append-only-scores-and-audit.md).
  - **Diagnostic log:** what the software did; JSON lines in
    `%APPDATA%\tScore\logs\tscore-YYYY-MM-DD.jsonl`; kept 14 days, capped at 50 MB;
    **rider numbers and ids only, never names.**
- Diagnostic lines carry: time with UTC offset, level, app version, event id, station id,
  session id, component, error code, message, context, and a **scan correlation id** linking
  one card's frames → reading → decision → database commit.
- One thin logging wrapper (electron-log underneath) serves main, renderer and vision worker.
- **Error codes** `TS-<AREA>-<NNN>` (e.g. `TS-CAM-001`). One registry in code generates
  `docs/errors.md` (user message, likely cause, fix). Error dialogs show the code with
  **Copy details** and **Report a problem**.
- **Report a problem** builds an offline zip (logs, crash dumps, versions, event _setup_);
  names and card images only if the user ticks a box.
- Crash dumps are written **locally only**. Any future online crash reporting is opt-in.

## Consequences

- Support bundles are safe to attach to public issues by default.
- Every new user-facing error needs a catalogue entry (part of the Definition of Done).

## Alternatives considered

- **One combined log:** mixes personal data into files that get shared for support.
- **Automatic online crash reporting:** conflicts with offline use and privacy; deferred, opt-in only.
