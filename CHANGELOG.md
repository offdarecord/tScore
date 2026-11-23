# Changelog

## [0.4.0](https://github.com/offdarecord/tScore/compare/v0.3.0...v0.4.0) (2026-11-23)


### Added

* give tScore its own app icon ([#23](https://github.com/offdarecord/tScore/issues/23)) ([dcf866c](https://github.com/offdarecord/tScore/commit/dcf866c82926108df2b34a10c60622667214e819))
* import riders from Entryplace, Ridernet and tScore rider lists ([#21](https://github.com/offdarecord/tScore/issues/21)) ([a016f71](https://github.com/offdarecord/tScore/commit/a016f71258e0ad38f68717a8347e5d8bef432be7))

## [0.3.0](https://github.com/offdarecord/tScore/compare/v0.2.0...v0.3.0) (2026-11-23)


### Added

* create, open and set up events in the app ([#19](https://github.com/offdarecord/tScore/issues/19)) ([07919c0](https://github.com/offdarecord/tScore/commit/07919c04ec61835c62097fc5841bdfa425b694ac))
* event store, one SQLite file per event with append-only scores ([#17](https://github.com/offdarecord/tScore/issues/17)) ([0d97f0a](https://github.com/offdarecord/tScore/commit/0d97f0a2aac948a954abc07b968f88d954cfbf77))


### Fixed

* explain why New event and Open event can't be used yet ([#11](https://github.com/offdarecord/tScore/issues/11)) ([08c63f0](https://github.com/offdarecord/tScore/commit/08c63f0663524a3b5e610e37bdd7ba5928e02ea0))
* never publish non-competitive scores, and list non-starters with their group ([#16](https://github.com/offdarecord/tScore/issues/16)) ([c1baecc](https://github.com/offdarecord/tScore/commit/c1baeccc202a9f4aaaa096303a691e83af61b0d0))
* order DNF riders by cleans, as past club results do ([#13](https://github.com/offdarecord/tScore/issues/13)) ([06c5440](https://github.com/offdarecord/tScore/commit/06c5440b2543764b6efa0651372d2f1f32e8c1ea))

## [0.2.0](https://github.com/offdarecord/tScore/compare/v0.1.0...v0.2.0) (2026-11-22)

> tScore is still in early development and not ready for events. This release adds the scoring rules behind the scenes; there are no new screens yet.

### Added

* **Results are worked out automatically.** tScore now adds up lap, day and event totals and places riders in each class. Ties are split by most cleans, then most 1s, 2s and 3s, then fewest 5s, then a ride-off. It also handles:
  * gate trials;
  * No award and Non-competitive riders;
  * DNF and DNS;
  * penalties;
  * sections dropped part-way through an event;
  * riders entered in two classes;
  * sidecars.

  Results stay "provisional" until every card is in and checked. ([#9](https://github.com/offdarecord/tScore/issues/9))

### Event files

* **Junior classes.** An event setup can now mark a class as junior, which is used to show junior riders' surnames as an initial in published results. Classes with "Junior", "Youth", "Boys" or "Girls" in their name count as junior unless marked otherwise. Setup files from 0.1.0 still open unchanged.

## 0.1.0 (2026-11-22)


### Added

* event setup and results file formats (draft) ([#4](https://github.com/offdarecord/tScore/issues/4)) ([2c76371](https://github.com/offdarecord/tScore/commit/2c76371246893823c2a7651367530701d3503aa0))

## Changelog

All notable changes to tScore are recorded here. This file is maintained by
[release-please](https://github.com/googleapis/release-please) from pull request titles, then
reworded for volunteers before each release.

Sections: **Added**, **Changed**, **Fixed**, plus **Event files** (schema version, migrations)
and **Results format** (`tscore.results/n`) whenever those change.
