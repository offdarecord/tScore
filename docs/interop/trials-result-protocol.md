# Mapping to the Entryplace trials result protocol

How a `tscore.results/1` payload maps onto Entryplace's
[`trials-result`](https://github.com/entry-place/trials-result-protocol) protocol. The decision
is recorded in [ADR 0013](../adr/0013-trials-result-protocol.md).

<!-- protocol-watch: the workflow compares this sha with upstream main. Update it after re-checking the mapping. -->

- **Checked against:** `trials-result/0.1`, upstream commit `86d3900` (21 Nov 2026)
- **Status:** mapping only; the exporter isn't built yet

## Refreshing this mapping

When upstream changes, the weekly `protocol-watch` workflow opens an issue. To clear it:

1. Read the upstream commits since the sha above.
2. Update the tables below, and the exporter once it exists.
3. Set the new sha above and close the issue.

## Document and event

| `tscore.results/1`            | `trials-result`                                                          |
| ----------------------------- | ------------------------------------------------------------------------ |
| `schema`                      | `protocol`: `"trials-result/0.1"`                                        |
| `status` provisional / final  | `document.status` provisional / official                                 |
| `revision` > 1                | `document.status: "amended"`, `document.version` = revision              |
| `generator`                   | `document.software`                                                      |
| `generated_at`                | `document.published_at`                                                  |
| (always)                      | `document.detail_level: "sections"`, `document.distribution: "public"`   |
| `event.name`, `club`, `venue` | `event.name`, `event.organiser`, `event.venue`                           |
| `event.permit`                | `event.permit`                                                           |
| `event.days[].date`           | `event.start_date` / `end_date`, and one `parts[]` of kind `day` per day |
| `event.scoring.score_values`  | `rule_sets[].section_scale.values`                                       |
| `event.scoring.direction`     | `rule_sets[].direction`: `low_wins` → `low`, `high_wins` → `high`        |
| `event.scoring.tie_breaks`    | `rule_sets[].tie_breaks` (see below)                                     |
| `event.id`                    | `document.id`                                                            |
| (not held)                    | `event.governing_bodies`, `country`, `region`: from Event setup          |

## Classes, laps and entries

| `tscore.results/1`                              | `trials-result`                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `classes[]`                                     | `classes[]` (`laps`, `sections_per_lap` per day) and one `classifications[]` of kind `class` |
| `classes[].days[].laps`                         | `parts[]` of kind `lap`, `parent` = the day part                                             |
| `classes[].days[].skipped`                      | `null` in the grid for that section from that lap                                            |
| `entries[].number`                              | `entries[].number`                                                                           |
| `entries[].riders`                              | `entries[].people[]` (`role` rider, or driver/passenger; `kind: "crew"` for a sidecar)       |
| `riders[].name`, `given_name`, `family_name`    | `person.name.as_printed`, `given`, `family`                                                  |
| `club`                                          | `person.club`                                                                                |
| `tier` competitive / no_award / non_competitive | `standing.basis` competition / no-award / non-competitive                                    |
| `status` finished / dnf / dns                   | event total's `status` classified / dnf / dns                                                |
| `position`, `tied_with_previous`                | classification row `rank`, `tied`                                                            |
| `rank_in_tier`                                  | row `rank_as_printed` ("NA") with `rank: null`                                               |
| `days[].laps[].sections`                        | `grids[]`, one per lap part                                                                  |
| lap, day and event `total`                      | `totals[]` with `part` = lap, day, or `null` for the event                                   |
| `counts`                                        | event total's `counts`                                                                       |
| `penalties[]`                                   | event total's `penalties[]`                                                                  |
| `ride_off`                                      | row `tie_break` with `rule: "ride-off"`                                                      |
| `also_in`                                       | the same entry listed in both classes' classifications                                       |

## Tie-breaks

| tScore     | `trials-result`                           |
| ---------- | ----------------------------------------- |
| `total`    | (the classification metric, `total`)      |
| `most_0`   | `most-cleans`                             |
| `most_1`   | `most-ones`                               |
| `most_2`   | `most-twos`                               |
| `most_3`   | `most-threes`                             |
| `fewest_5` | **none:** `other` for now; raise upstream |
| `ride_off` | `ride-off`                                |

## Privacy rules the exporter must keep

- **Non-competitive riders:** `standing.scores_public: false`. Send no `grids`, no lap or day
  `totals`, and a `null` event total; send `counts` only. The scores are left out of the
  file, not hidden.
- **Junior classes:** surnames already reduced to an initial in `tscore.results/1`.
- **Licence numbers and other identifiers:** never sent. `person.identifiers` is only allowed
  with `distribution: internal`, and tScore doesn't hold them in results anyway.
- **PRIN** (the protocol's public rider id): not sent; riders claim results themselves on
  Entryplace.

## Gaps to raise upstream

1. There's no `fewest-fives` tie-break value.
2. There's no tie-break for **clean laps**, which one Victorian club uses.
3. There's no way to say a missed lap was scored as the maximum rather than DNF (another club
   practice).
4. The repository has no licence yet, so others can't safely reuse the schema.
