# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

tScore will be maintained by volunteers over many years. People join and leave, and the
reasons behind early choices are easily lost, which leads to the same debates being reopened.
The project was planned in detail before any code was written; that planning needs a public,
durable home.

## Decision

Record significant decisions as short Markdown ADRs in `docs/adr/`, numbered in order, using
[`0000-template.md`](0000-template.md). The first set is seeded from the planning decisions log.
A changed decision gets a new ADR that supersedes the old one; old ADRs are never rewritten.

"Significant" means: hard to reverse, affects contributors or users, or would otherwise be
argued about again (platform, storage, file formats, licensing, release process, UX rules).

## Consequences

- New contributors can learn _why_ the code looks the way it does.
- A PR that changes a recorded decision must add or supersede an ADR.

## Alternatives considered

- **Wiki pages:** drift from the code and are not reviewed in PRs.
- **No records:** cheapest now, most expensive later.
