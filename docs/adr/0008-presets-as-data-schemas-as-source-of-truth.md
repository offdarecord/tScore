# 0008. Presets as data; JSON Schemas are the source of truth

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

Clubs, states and countries differ in class lists, tie-break rules, entry-system exports,
label stock and scorecard designs. If each difference needs code, every new region becomes a
feature request to a small team.

## Decision

- Everything a club or region might change lives as **JSON in `presets/`**: `class-lists/`,
  `import-mappings/`, `rulesets/`, `label-templates/`, `card-profiles/`, and later
  `points-tables/` and `forms/`.
- **JSON Schemas in `schemas/`** define every file format: presets, `tscore.event_setup/1`,
  `tscore.results/1`. TypeScript types are **generated** from the schemas; the same schemas
  validate files when loaded and in CI.
- Schema ids are versioned (`tscore.results/1`). Additive changes keep the number; breaking
  changes increment it.

## Consequences

- A new state can join with a small data-only pull request.
- One definition of each format; types and validation can't drift apart.
- Schemas are MIT-licensed ([0004](0004-licensing.md)) so others can adopt them.

## Alternatives considered

- **Hand-written TypeScript types + separate validation:** two definitions that drift.
- **Configuration in code:** every regional difference needs a developer.
