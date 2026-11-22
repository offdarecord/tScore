# tScore file formats

JSON Schemas for tScore's file formats. **Licensed under MIT** (see [`LICENSE`](LICENSE)), separately
from the rest of the repository, so results sites and other tools can adopt these formats freely.

| Schema id              | What                                                                   | Status                  |
| ---------------------- | ---------------------------------------------------------------------- | ----------------------- |
| `tscore.event_setup/1` | Event configuration: days, classes, sections and laps per day, labels  | Planned (Phase 0)       |
| `tscore.results/1`     | Canonical results payload; feeds PDF, CSV and publishers               | Draft planned (Phase 0) |
| Preset schemas         | Class lists, rulesets, import mappings, label templates, card profiles | Planned                 |

## Versioning

- The number after `/` is the format's major version.
- **Additive** changes (new optional fields) keep the number.
- **Breaking** changes increment it (`/1` → `/2`), and are announced to known consumers
  before release.

These schemas are the source of truth: TypeScript types are generated from them, and the
same schemas validate files when the app loads them and in CI ([ADR 0008](../docs/adr/0008-presets-as-data-schemas-as-source-of-truth.md)).
