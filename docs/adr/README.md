# Architecture decision records

Each file records one decision: the context, what was decided, and what follows from it.
New decisions get the next number. A decision that changes is not edited away: write a new
ADR that supersedes it and set the old one's status to `Superseded by NNNN`.

Template: [`0000-template.md`](0000-template.md).

| #                                                          | Decision                                                             | Status   |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)              | Record architecture decisions                                        | Accepted |
| [0002](0002-electron-typescript-windows-first.md)          | Electron + TypeScript for everything; Windows x64 first              | Accepted |
| [0003](0003-single-typescript-vision-module.md)            | One TypeScript vision module, no OpenCV.js                           | Accepted |
| [0004](0004-licensing.md)                                  | Apache-2.0 app, MIT schemas, CC BY 4.0 docs                          | Accepted |
| [0005](0005-sqlite-one-file-per-event.md)                  | SQLite, one file per event; JSON for export                          | Accepted |
| [0006](0006-sqlite-driver.md)                              | SQLite driver: `node:sqlite` preferred, `better-sqlite3` fallback    | Accepted |
| [0007](0007-append-only-scores-and-audit.md)               | Append-only score versions and audit log                             | Accepted |
| [0008](0008-presets-as-data-schemas-as-source-of-truth.md) | Presets as data; JSON Schemas are the source of truth                | Accepted |
| [0009](0009-ui-stack.md)                                   | UI: React + Mantine + TanStack Table                                 | Accepted |
| [0010](0010-build-and-test-tooling.md)                     | Build and test tooling                                               | Accepted |
| [0011](0011-releases-and-changelog.md)                     | Conventional Commits, release-please, SemVer                         | Accepted |
| [0012](0012-logging-and-error-codes.md)                    | Separate audit and diagnostic logs; error codes                      | Accepted |
| [0013](0013-trials-result-protocol.md)                     | Keep `tscore.results/1`; export Entryplace `trials-result`           | Accepted |
| [0014](0014-reading-entry-list-spreadsheets.md)            | Reading entry lists: SheetJS CE pinned from its CDN                  | Accepted |
| [0015](0015-card-labels-as-word-documents.md)              | Card labels as a hand-built Word document (fflate, qrcode-generator) | Accepted |
| [0016](0016-user-guide-built-into-the-app.md)              | User guide built into the app, from the same Markdown as GitHub      | Accepted |
