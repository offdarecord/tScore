# 0009. UI: React + Mantine + TanStack Table

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

The UI must feel finished to a volunteer in a muddy score tent: high contrast in daylight,
keyboard-first, accessible, with designed empty/loading/error states. A part-time team should
not maintain home-made form, table or modal components.

## Decision

- **React** with **TypeScript** in the Electron renderer.
- **Mantine** (MIT) as the single component library: accessible forms, modals, notifications,
  theming through one theme file of design tokens.
- **TanStack Table** with virtual scrolling for large grids (Progress: ~200 riders × 10 laps).
- One icon set (Tabler Icons, which Mantine uses).
- Default theme: high-contrast light; body text ≥ 16 px; scan-desk number and result ≥ 48 px.
- Interaction rules: every scan-desk action has a key shown on its button; undo instead of
  "Are you sure?" for reversible actions; scanning is never blocked by the review queue.
- Accessibility: WCAG 2.2 AA; automated axe checks and screenshot comparisons in end-to-end tests.
- Screens are mocked up and reviewed with an experienced scorer before they are coded.

## Consequences

- Fewer custom components; consistent look and behaviour.
- We follow Mantine's major-version upgrades.

## Alternatives considered

- **Fluent UI v9:** native Windows 11 look, but heavier styling model and less suited to a
  possible Mac build.
- **Plain HTML/CSS components:** more to build and keep accessible.
