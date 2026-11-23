# Test fixtures

Ground truth for automated tests:

- **Card images + expected readings** for the vision accuracy bench
  ([ADR 0003](../docs/adr/0003-single-typescript-vision-module.md)).
- **Golden events** (`golden/`): past events whose official results the engine must reproduce.
  Each file holds the event (classes, sections, laps), riders **by number only**, every card's
  section scores, and per class the official totals and order. Sources are clubs' scoring
  workbooks and published results sheets (PDF). `checkOrder: false` marks a workbook saved
  before its final sort; for those only totals and statuses are checked. `published` holds the
  order and place column ("1", "NA", "NC", "DNF", "DNS") of the published sheet, where one was
  used. Tested by `packages/core/src/results/golden.test.ts`, which also checks that the files
  contain no text other than class names and status words.

## Privacy rules (must follow)

Fixtures are public. Everything here must be **anonymised**:

- No real rider names, licence numbers, dates of birth, addresses, phone numbers or medical data.
- Card photos show only the punch grid and **synthetic** labels (re-shoot cards with a fake
  label; never crop or blur a real one).
- Golden events identify riders by number only ("Rider 12"), with no clubs, licences, dates,
  venues or event names. Only results data (scores, statuses, totals, order) is taken from a
  workbook, never its formulas, code or layout.
- **Non-competitive riders:** their scores are never published (a governing-body rule), so a
  fixture keeps only their counts. Their scores are stored sorted lowest first across their
  cards: that keeps their counts, total and laps ridden, but not their real section scores.
- Never add real entry-list exports, scoring workbooks or anything derived from a commercial
  scoring product's layouts.

CI will scan fixtures for obvious personal data. If in doubt, leave it out and ask in an issue.
