# 0016. Build the user guide into the app, from the same Markdown as GitHub

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Volunteers use tScore a few times a year, under pressure, at venues with no internet and nobody
to ask. Help on a website can't be reached on the day. The same words should also be readable on
GitHub by anyone preparing for an event. Error messages carry codes (ADR 0012) that need a "what
to do" answer the desk can reach from the message.

## Decision

- The user guide is Markdown in `docs/guide/`, written by task in the desk's words. GitHub shows
  it as it is.
- The renderer bundles those files at build time (`import.meta.glob`, raw text) and shows them
  in a **Help** panel beside the current screen (Mantine `AppShell.Aside`). Nothing is fetched.
- Markdown is parsed with `marked`'s lexer and rendered to Mantine components by our own code.
  No HTML string is injected, and HTML in a page is ignored, so the strict CSP holds.
- `help/topics.ts` maps each screen to a page and heading; **Help** and F1 open it. Links between
  pages, GitHub heading ids and `> [!TIP]`-style callouts work the same in both places.
- **Refines ADR 0012:** the error catalogue lives in `packages/core/src/errors.ts`. Code keeps
  short internal names (`STORE_DAMAGED`); the desk sees a public code (`TS-DB-003`). The
  generated page is `docs/guide/errors.md` (not `docs/errors.md`), so it's part of the guide and
  each error message's **What to do** opens its entry.
- Tests fail on a broken link, anchor or image, a screen without a help page, an error the code
  raises without a catalogue entry, or an out-of-date error page.

## Consequences

- Help works offline and matches the installed version.
- Every behaviour change updates `docs/guide/` in the same pull request (Definition of Done).
- Pictures come later, from the screenshot script, into `docs/guide/images/`.
- The installer carries the guide (tens of kilobytes) and `marked` (MIT, no dependencies).

## Alternatives considered

- **A documentation website:** needs internet on the day; a second copy to keep in step.
- **Help text written into each screen:** can't be read ahead on GitHub, and scatters the words.
- **`react-markdown`:** works, but brings a large dependency tree for a small, fixed set of
  Markdown features.
