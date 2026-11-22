# Test fixtures

Ground truth for automated tests:

- **Card images + expected readings** for the vision accuracy bench
  ([ADR 0003](../docs/adr/0003-single-typescript-vision-module.md)).
- **Golden events:** past events whose official results the engine must reproduce exactly.

## Privacy rules (must follow)

Fixtures are public. Everything here must be **anonymised**:

- No real rider names, licence numbers, dates of birth, addresses, phone numbers or medical data.
- Card photos show only the punch grid and **synthetic** labels (re-shoot cards with a fake
  label; never crop or blur a real one).
- Golden events have names replaced and identifying details removed.
- Never add real entry-list exports, scoring workbooks or anything derived from a commercial
  scoring product's layouts.

CI will scan fixtures for obvious personal data. If in doubt, leave it out and ask in an issue.
