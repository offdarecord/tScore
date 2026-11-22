# tScore file formats

JSON Schemas (draft 2020-12) for tScore's file formats. **Licensed under MIT** (see
[`LICENSE`](LICENSE)), separately from the rest of the repository, so results sites and other
tools can adopt these formats freely.

| Schema id              | File                                                                     | What                                                                           | Status                |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------- |
| `tscore.event_setup/1` | [`tscore.event_setup.v1.schema.json`](tscore.event_setup.v1.schema.json) | How an event runs: days, classes, sections and laps per day, labels            | Draft                 |
| `tscore.results/1`     | [`tscore.results.v1.schema.json`](tscore.results.v1.schema.json)         | Published results; feeds the PDF, CSV and every publisher. [Guide](RESULTS.md) | **Draft, for review** |
| Preset schemas         | —                                                                        | Class lists, rulesets, import mappings, label templates, card profiles         | Planned               |

Examples (all names are made up): [`examples/`](examples/).

## Versioning

- The number after `/` is the format's major version; every file states it in its `schema` field.
- **Additive** changes (new optional fields) keep the number.
- **Breaking** changes increment it (`/1` → `/2`) and are announced to known consumers
  before release.
- While a format is marked **Draft**, it may still change without a version bump.

## Two layers of validation

1. **The schema** checks structure: field names, types, allowed values. Unknown fields are
   rejected, which also keeps personal data (such as licence numbers) out of published results.
2. **tScore's rule checks** catch what a schema can't express: days numbered 1, 2, 3…, unique
   class names, sections that fit the scorecard; in results, that totals add up and only
   competitive finishers have a position. These live in `packages/core`
   (`validateEventSetup`, `validateResults`).

## For tScore developers

The schemas are the source of truth ([ADR 0008](../docs/adr/0008-presets-as-data-schemas-as-source-of-truth.md)).
After changing a schema, run:

```sh
npm run gen:schemas
```

This regenerates `packages/core/src/generated/`: TypeScript types, and validators compiled
ahead of time (so nothing evaluates code at runtime, which the app's security policy forbids).
CI fails if the generated files are out of date. Never edit them by hand.
