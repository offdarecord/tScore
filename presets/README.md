# Presets

Everything a club, state or country might need to change lives here as **data**, not code
([ADR 0008](../docs/adr/0008-presets-as-data-schemas-as-source-of-truth.md)). Every file is
validated against its JSON Schema in `schemas/` in CI.

| Folder             | Contents                                                                              |
| ------------------ | ------------------------------------------------------------------------------------- |
| `class-lists/`     | Classes and their default numbering order                                             |
| `rulesets/`        | Score values, tie-break order, missed-section and DNF rules, competition status rules |
| `import-mappings/` | Column and class mappings for entry-system exports                                    |
| `label-templates/` | Label stock geometry (e.g. Avery L7651) and content layout                            |
| `card-profiles/`   | Scorecard designs: size, rows, value columns, locator, marking, trust                 |

`contact.json` holds where people send things to the maintainers: the email address used by
**Suggest a feature** and by sharing a card type, and the GitHub **New card type** form. It's
checked by `checkContact` in `packages/core/src/contact.ts`.

Folders are created as the first preset of each kind is added.

**Presets contain no personal data.** No rider names, licence numbers or contact details.
