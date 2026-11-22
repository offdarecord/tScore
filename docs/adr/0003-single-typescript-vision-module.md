# 0003. One TypeScript vision module, no OpenCV.js

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

tScore reads punched observer scorecards from a USB document camera. Discovery prototypes
were written in Python. Reading a punched grid needs only a few operations: find the card's
alignment feature, straighten the image, sample cell darkness, decode a QR code.

## Decision

- Implement card reading once, in **pure TypeScript**, in `packages/vision`:
  canvas/`ImageData` pixel sampling, a small 4-point perspective transform, a pure-JS QR
  decoder (jsQR or ZXing), and a small marker detector only if the fallback locator needs it.
- **No OpenCV.js** (WebAssembly) and **no second vision codebase.** The Python prototypes are
  throwaway and are not ported or maintained.
- The contract is the **ground-truth fixture set** in `fixtures/`: anonymised card images plus
  expected-reading JSON. The same module runs against it in Node (accuracy bench, CI) and in
  the app's Web Worker.
- Card designs are described by **card profiles** (data) that name a **locator**
  (`black-column`, `card-edges`, `marker-mat`, `qr-card`), so new cards are usually data only.
- Auto-accept thresholds are set so the fixture set has **zero wrong auto-accepts**.

## Consequences

- Debuggable in Chrome DevTools; no WASM memory pitfalls or packaging risk.
- We write a little more image code ourselves; it is small and fully tested.
- The bench runs in CI on every PR, so accuracy cannot silently regress.

## Alternatives considered

- **OpenCV.js:** large, memory-management pitfalls, packaging risk, little gain for this task.
- **Python bench + TypeScript port:** two codebases to keep in step; a maintenance trap.
