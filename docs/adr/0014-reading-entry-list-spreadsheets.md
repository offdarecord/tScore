# 0014. Reading entry lists: SheetJS Community Edition, pinned from its own CDN

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Rider import ([how it works](../interop/rider-list.md); presets in
[`presets/import-mappings/`](../../presets/import-mappings/)) has to read what Australia's two
entry systems export:

- **Entryplace:** an Excel `.xlsx` workbook, entries on the first sheet (`Entry List`).
- **Ridernet:** a legacy Excel 97–2003 **`.xls` (BIFF8)** workbook. It's not CSV renamed.

Anything else uses tScore's documented rider-list **CSV**.

Entry lists are full of personal data that tScore must not keep (dates of birth, addresses,
phone numbers, medical and emergency details). Whatever reads the file must let us copy out
only the columns a preset declares.

Libraries considered (November 2026):

- **SheetJS Community Edition** (`xlsx`, Apache-2.0). It reads `.xls`, `.xlsx` and CSV in pure
  JavaScript, with no native code. Current releases (0.20.3) are published **only on
  `cdn.sheetjs.com`**. The npm registry's `xlsx` package stopped at 0.18.5, which has
  published advisories (prototype pollution, ReDoS) fixed in later releases.
- **ExcelJS:** reads `.xlsx` only, not `.xls`.
- **Writing our own BIFF8 reader:** a large, error-prone format. Not worth it for one export.

## Decision

- Use **SheetJS CE 0.20.3**, installed from its CDN tarball
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). `package-lock.json` records the
  URL and its integrity hash, so every install gets exactly those bytes.
- It is a dependency of `@tscore/store` only, so it runs in the **main process**, never the
  renderer. It reads the file as plain values: no formulas evaluated, no styles, no macros
  (`.xlsm` VBA is never run).
- The reader returns a table of strings. The import code then keeps **only the columns the
  matched preset declares**. Everything else is dropped before anything crosses IPC to the
  window or reaches the event file or the logs.
- CSV is read by the same library, so all three formats go through one path.

## Consequences

- Dependabot can't see the CDN package. Updating it is a manual job: check
  `https://cdn.sheetjs.com/` when doing dependency updates, and note the version in the PR.
- If SheetJS stops publishing CE, the pinned tarball keeps working. The fallback would be
  ExcelJS plus asking Ridernet users to save as `.xlsx`.
- Entry files are untrusted input. Parsing runs only on a file the desk picks in the open
  dialog, and a file that fails to parse gets a plain message, not a crash.

## Alternatives considered

- **The npm `xlsx` 0.18.5:** stale, with known advisories.
- **Asking clubs to convert `.xls` to `.xlsx` or CSV first:** a step every event for a
  volunteer, rejected in the planning decisions for the same reason as hand-made exports.
