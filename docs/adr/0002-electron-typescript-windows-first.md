# 0002. Electron + TypeScript for everything; Windows x64 first

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

tScore runs on club laptops at venues with no internet, operated by non-technical volunteers,
and is maintained by part-time volunteers. It needs camera access, printing, a local database,
reliable installers and auto-update. Support cost matters more than install size.

## Decision

- Build the whole product in **TypeScript on Electron**: UI, card reading, scoring, tests.
- Target **Windows 10/11 x64 only** for now. Mac is deferred, not designed out: no
  Windows-specific code outside clearly isolated adapters, and unit tests that stay
  platform-neutral.
- Track a current Electron major (Electron supports only its latest three); plan a major
  upgrade about every six months.
- Low-spec target: 4 GB RAM, dual-core. Heavy work (vision) runs off the UI thread.

## Consequences

- Same Chromium everywhere, so camera, rendering and printing behave identically.
- One language for contributors; the largest pool of potential volunteers.
- Mature installer and auto-update tooling with free hosting on GitHub Releases.
- Install size is large (~150 MB). Accepted.
- Windows 10 stays supported for as long as Electron supports it.

## Alternatives considered

- **Python backend + web UI:** strong for vision, but packaged Python executables commonly
  trigger antivirus false positives, there is no built-in auto-update, and it still needs a
  JavaScript front end (two languages).
- **PWA:** browser storage can be wiped; not acceptable for "never lose a card".
- **Tauri:** small installers, but uses each OS's own web engine, so camera and print
  behaviour differ per platform.
