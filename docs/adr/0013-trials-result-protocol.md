# 0013. Keep `tscore.results/1` and export the Entryplace trials result protocol

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Entryplace has published a draft open format for trials results,
[`trials-result/0.1`](https://github.com/entry-place/trials-result-protocol). Entryplace runs
entries for most Australian clubs, so results sites are likely to read that format. Any results
tScore publishes need to line up with it.

The protocol is broader than `tscore.results/1`:

- It's meant for transcribing any published sheet, so nearly every field is optional.
- It covers gate and timed trials, routes, teams and series.
- Objects refer to each other by id.

`tscore.results/1` is narrower:

- It covers only the results tScore computes.
- Every field is complete, and the arithmetic and placings are checked by `validateResults`.

The protocol is at draft 0.1 and will change. Its repository has no licence yet, so we can't
copy its schema text into this repo.

## Decision

- **Keep `tscore.results/1` as tScore's own results format.** It's the single source for
  every output (PDF, CSV, JSON).
- **Add an exporter** from `tscore.results/1` to `trials-result/0.x` when publishing to results
  sites is built. The field-by-field mapping is in
  [`docs/interop/trials-result-protocol.md`](../interop/trials-result-protocol.md).
- **Track the protocol's version.** The doc records the upstream commit the mapping was last
  checked against. A weekly workflow (`protocol-watch.yml`) opens an issue when upstream
  changes, so the mapping is refreshed rather than drifting.
- **Send gaps upstream.** Anything tScore produces that the protocol can't hold (for example
  the `fewest_5` tie-break) is reported upstream, not worked around silently.

## Consequences

- Our own format can stay strict and versioned on our schedule, while results sites get the
  shared format.
- **Mapping upkeep:** each upstream change needs its mapping checked. The watch workflow makes
  that a visible task.
- **Exporter must apply privacy:** non-competitive riders' scores are left out, licence ids are
  never sent, and the junior surname rule is applied. The protocol allows all of these
  (`standing.scores_public: false`, `distribution: public`).

## Alternatives considered

- **Adopt `trials-result` as tScore's only format.** Rejected for now. It's a draft that will
  change, and almost everything in it is optional, so it can't be checked as strictly as
  `tscore.results/1`. Revisit when it reaches 1.0.
- **Ignore it and publish only `tscore.results/1`.** Rejected. Results sites would need two
  readers, and Entryplace is the main source of entries in Australia.
