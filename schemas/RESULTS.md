# `tscore.results/1`: results format guide

> **Status: DRAFT for review.** Field names and meanings may still change before tScore's
> first release. Comments are welcome as GitHub issues.

`tscore.results/1` is the published results of one motorcycle trials event, as a single JSON
file. tScore builds it once and uses it for everything: the results PDF, the CSV, and sending
results to websites. A results site needs to understand only this one format.

- **Schema:** [`tscore.results.v1.schema.json`](tscore.results.v1.schema.json) (JSON Schema 2020-12)
- **Example:** [`examples/results.one-day.json`](examples/results.one-day.json)
- **Licence:** MIT. Use it, copy it, build on it.

## What's in it, and what isn't

**In:** the event, each class, and for each entry: rider number, name(s), club, tier, status,
position, total, counts of each score, and every lap's section scores and penalties.

**Not in:** licence numbers, dates of birth, contact or medical details, card images, edit
history. The schema rejects unknown fields, so these can't slip in. Club privacy rules (such
as showing juniors' surnames as an initial) are already applied; `privacy_applied` lists them.

## Shape

```text
Results
├─ schema            "tscore.results/1"
├─ generator         { name, version }        software that made it
├─ generated_at      date-time with UTC offset
├─ status            "provisional" | "final"
├─ revision          1, 2, 3 …                 a correction after publishing gets a higher revision
├─ privacy_applied   ["junior_surname_initial", …]
├─ event
│  ├─ id             UUID                      stable across revisions
│  ├─ code, name, club?, venue?, permit?
│  ├─ days[]         { day, date }
│  └─ scoring        { score_values, direction, tie_breaks }
└─ classes[]         in display order
   ├─ name
   ├─ days[]         { day, sections, laps, skipped?[] }
   └─ entries[]      in display order (see below)
      ├─ number
      ├─ riders[]    { name, given_name?, family_name? }   two for a sidecar (driver first)
      ├─ club?
      ├─ tier        "competitive" | "no_award" | "non_competitive"
      ├─ status      "finished" | "dnf" | "dns"
      ├─ position    1, 2, 3 … or null
      ├─ rank_in_tier   order among NA or NC finishers, or null
      ├─ tied_with_previous?
      ├─ total       days + penalties, or null for DNS
      ├─ counts      { "0": 8, "1": 1, "2": 0, "3": 1, "5": 0 }
      ├─ days[]      { day, total, laps[] { lap, total, sections[] } }
      ├─ penalties[] { points, reason, note?, day?, lap? }
      ├─ ride_off?   ride-off position, if one decided a tie
      └─ also_in?    other class(es) these same scores count in
```

## Meanings

### Status and revisions

- `provisional`: some cards are missing or still being checked. Show it with a clear
  "provisional" note, or don't publish it.
- `final`: confirmed by the Clerk of Course or results officer.
- A correction after publishing (for example, a protest upheld) produces a new `final` payload
  with the same `event.id` and a higher `revision`. **Keep the highest revision; it replaces
  the earlier ones.** Receiving the same `event.id` + `revision` twice is a retry and can be
  ignored.

### Scoring

- `score_values`: allowed section scores. The usual set is `[0, 1, 2, 3, 5]`: 0 clean,
  1–3 dabs, 5 fail.
- `direction`: `low_wins` for normal trials; `high_wins` for gate trials.
- `tie_breaks`: how ties were broken, in order. `total`; then `most_0`, `most_1`, … (more of
  that score is better); `fewest_5` (fewer is better); `ride_off`.

### Tiers, status and position

Within a class, entries come in this order (checked against past events' scoring workbooks and published results):

| Order | Who                           | `tier`            | `status`   | `position` | `rank_in_tier` | Show as    |
| ----- | ----------------------------- | ----------------- | ---------- | ---------- | -------------- | ---------- |
| 1     | Competitive finishers         | `competitive`     | `finished` | 1, 2, 3 …  | null           | 1st, 2nd … |
| 2     | Competitive non-finishers     | `competitive`     | `dnf`      | null       | null           | DNF        |
| 3     | Competitive non-starters      | `competitive`     | `dns`      | null       | null           | DNS        |
| 4     | No Award finishers            | `no_award`        | `finished` | null       | 1, 2 …         | NA         |
| 5     | No Award non-finishers        | `no_award`        | `dnf`      | null       | null           | DNF        |
| 6     | No Award non-starters         | `no_award`        | `dns`      | null       | null           | DNS        |
| 7     | Non-competitive finishers     | `non_competitive` | `finished` | null       | 1, 2 …         | NC         |
| 8     | Non-competitive non-finishers | `non_competitive` | `dnf`      | null       | null           | NC         |
| 9     | Non-competitive non-starters  | `non_competitive` | `dns`      | null       | null           | NC         |

- **Non-competitive riders' scores are never published** (a governing-body rule). Their
  entries carry `counts` only: `total` is null, and there are no `days` or `penalties`.
  The scores are left out of the file, not hidden, so no output can show them. Show these
  riders as "NC", after everyone else.
- **No Award riders** are scored and ranked among themselves but never placed, so they never
  take a podium place.
- **DNF riders** didn't ride every lap, so their totals aren't comparable. They're ordered by
  the tie-breaks without the total: most cleans first, then most 1s, 2s and 3s, then fewest 5s.
- **Provisional results only:** a rider still riding with a card not yet in is listed after
  those in their group with every card in. Final results never contain such riders.

Consumers should show entries in the order given rather than re-sorting them. Two entries
with every tie-break equal share a placing: `tied_with_previous` is `true` on the second.

### Scores

- `days[].laps[].sections` lists each section's score in order. `null` in the list is a
  section that wasn't scored (cancelled); the class's `skipped` list says which and from
  which lap.
- A lap that wasn't ridden (DNF) has `sections: null` and `total: null`.
- Lap total = sum of its sections; day total = sum of its laps; entry `total` = sum of days +
  sum of penalty `points`.
- `counts` tallies section scores across the whole event. It's what the `most_N` / `fewest_N`
  tie-breaks use.

### Sidecars and second classes

- A sidecar is one entry with two `riders`: driver, then passenger.
- A rider entered in two classes appears in both, with the same scores; `also_in` names the
  other class.

## Checking a file

The schema checks structure. tScore also checks the arithmetic and placings
(`validateResults` in `packages/core`): lap, day and event totals, counts, and that only
competitive finishers have a position. A consumer can run the same checks or just the schema.

## Open questions for results sites

1. Which fields does your site need that aren't here (e.g. state, machine, licence class)?
2. Do you need a stable id per rider across events? (Not included today, for privacy.)
3. Should section-by-section scores be optional, for sites that show totals only?
4. How should a correction be shown to visitors: replace silently, or show "updated"?
