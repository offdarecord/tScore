# Changelog

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
