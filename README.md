<p align="center">
  <img src="assets/tscore-banner.jpg" width="900" alt="tScore: Mototrials scoring app. Automated card scanning. Works offline.">
</p>

# tScore

**Free, open-source scoring for motorcycle trials, built for club volunteers at venues with no internet.**

> **Status: early version.** tScore is new and still growing: try it at home before you use it
> at an event.
> Follow progress in [Releases](https://github.com/offdarecord/tScore/releases) and the
> [changelog](CHANGELOG.md).

tScore is a Windows desktop app that:

1. **Scores trials events.** Single or multiple days, classes, sections and laps; DNF/DNS, penalties,
   second classes and sidecars; results ranked with the usual tie-breaks.
2. **Reads punched observer scorecards** with a cheap USB document camera, so nobody types
   scores. Only cards that need a human go to a review queue.
3. **Handles pre-event work.** Imports the online entry list, generates rider numbers, and
   prints card labels with a QR code.
4. **Publishes results** as PDF, CSV and JSON, and later directly to results sites, queued
   offline and sent when back in reception.

Everything works offline. Every score traces back to a card image and an audit log.

Website: **<https://offdarecord.github.io/tScore/>**

## Download

Get `tScore-Setup-<version>.exe` from the
[latest release](https://github.com/offdarecord/tScore/releases/latest) and run it (Windows 10 or
11; no administrator password needed). Until the installer is signed, Windows may show **Windows
protected your PC**: choose **More info**, then **Run anyway**. Then read
[Getting started](docs/guide/getting-started.md). To remove tScore: Windows Settings → Apps →
tScore → Uninstall.

## See it work

<p>
  <img src="docs/media/manual-entry.png" width="49%" alt="Manual entry: a rider's scores typed as one string of digits, with a drawing of the card filling in beside it">
  <img src="docs/media/results.png" width="49%" alt="Results: a class ranked with lap totals, totals and counts of 0s to 5s, marked provisional while cards are missing">
</p>
<p>
  <img src="docs/media/progress.png" width="49%" alt="Progress: which cards are in for every rider and lap, with overdue riders flagged">
  <img src="docs/media/card-labels.png" width="49%" alt="Card labels: a sheet of labels with rider name, class, lap and a QR code on each">
</p>

More in [the tour](docs/tour.md). The pictures use an invented event and come from the real app
(`npm run screenshots`).

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

- Committers and reviewers:
  [contributors with write access](https://github.com/offdarecord/tScore/graphs/contributors)
- Approvers: [the repository owner](https://github.com/offdarecord)

Privacy: this program will not transfer any information to other networked systems unless
specifically requested by the user or the person installing or operating it, except checking
GitHub for a newer version when online with no event open. Details in
[CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md).

## For developers

Requirements: Windows 10/11 x64, [Node.js 24 LTS](https://nodejs.org/), Git.

```sh
git clone https://github.com/offdarecord/tScore.git
cd tScore
npm install
npm start
```

| Command               | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| `npm start`           | Run the desktop app in development mode                                    |
| `npm test`            | Unit tests                                                                 |
| `npm run test:e2e`    | Launch the real app and click through it (Playwright, accessibility check) |
| `npm run check`       | Lint, format check, type-check and tests (what CI runs)                    |
| `npm run dist`        | Build the Windows installer into `apps/desktop/release/`                   |
| `npm run site`        | Build the website (GitHub Pages) into `_site/`                             |
| `npm run screenshots` | Refresh the README and tour pictures in `docs/media/` (demo event)         |

### Layout

| Path              | What                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `packages/core`   | Event model, scoring, ranking, results. Pure TypeScript          |
| `packages/vision` | Card reading. Pure TypeScript; runs in Node and in a Web Worker  |
| `apps/desktop`    | Electron app: main process, preload, React + Mantine UI          |
| `schemas/`        | JSON Schemas for tScore's file formats (MIT)                     |
| `assets/`         | tScore artwork (banner) for the README and project pages         |
| `presets/`        | Class lists, rulesets, label templates, card profiles, as data   |
| `fixtures/`       | Anonymised test data: card images, golden events                 |
| `docs/guide/`     | The user guide, also built into the app as its Help              |
| `docs/adr/`       | Architecture decision records: _why_ things are the way they are |
| `.claude/skills/` | Maintainer workflows for Claude Code                             |

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Licence

- Application: [Apache License 2.0](LICENSE) (see also [NOTICE](NOTICE)).
- File formats in `schemas/`: [MIT](schemas/LICENSE).
- Documentation in `docs/`: [CC BY 4.0](docs/LICENSE).
- The tScore logo, app icon and banner (`assets/`, `apps/desktop/build/icon.*`): **all rights
  reserved**, not covered by the licences above ([details](assets/LICENSE)).

"tScore" is the name of this project; modified versions should use a different name and their
own icon.
