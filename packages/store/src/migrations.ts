/**
 * The event file's schema, as an ordered list of migrations (ADR 0005).
 *
 * `PRAGMA user_version` holds the number of migrations applied. Never edit a migration that has
 * shipped in a release: add a new one. Every release's files must still open and migrate
 * forward, which the migration tests check.
 */
export const MIGRATIONS: readonly string[] = [
  // 1: first schema.
  `
  -- Key/value facts about the file itself (app versions that created and last opened it).
  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  -- Exactly one row: the event and its setup (a tscore.event_setup/1 document).
  CREATE TABLE event (
    id         TEXT PRIMARY KEY,
    setup_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  -- Riders (or sidecar crews). Current state; every change is also in audit_event.
  CREATE TABLE entry (
    id           TEXT PRIMARY KEY,
    number       INTEGER NOT NULL UNIQUE CHECK (number >= 1),
    riders_json  TEXT NOT NULL,
    club         TEXT,
    tier         TEXT NOT NULL CHECK (tier IN ('competitive', 'no_award', 'non_competitive')),
    status       TEXT NOT NULL CHECK (status IN ('riding', 'dnf', 'dns')),
    classes_json TEXT NOT NULL,
    ride_off_json TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  ) STRICT;

  -- One card per rider, day and lap. Its scores are in score_version.
  CREATE TABLE card (
    id         TEXT PRIMARY KEY,
    number     INTEGER NOT NULL,
    day        INTEGER NOT NULL CHECK (day >= 1),
    lap        INTEGER NOT NULL CHECK (lap >= 1),
    image_path TEXT,
    station_id TEXT NOT NULL,
    operator   TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (number, day, lap)
  ) STRICT;

  -- Section scores, append-only (ADR 0007). A correction inserts a new version and points the
  -- old one at it; nothing is updated in place or deleted. value NULL = not decided yet.
  CREATE TABLE score_version (
    id            TEXT PRIMARY KEY,
    card_id       TEXT NOT NULL REFERENCES card (id),
    section       INTEGER NOT NULL CHECK (section >= 1),
    value         INTEGER,
    source        TEXT NOT NULL CHECK (source IN ('scan', 'review', 'manual', 'amend', 'import')),
    confidence    REAL,
    reason        TEXT,
    station_id    TEXT NOT NULL,
    operator      TEXT,
    created_at    TEXT NOT NULL,
    superseded_by TEXT REFERENCES score_version (id) DEFERRABLE INITIALLY DEFERRED
  ) STRICT;
  CREATE UNIQUE INDEX score_version_current
    ON score_version (card_id, section) WHERE superseded_by IS NULL;

  CREATE TRIGGER score_version_no_delete BEFORE DELETE ON score_version
  BEGIN SELECT RAISE(ABORT, 'score versions are append-only'); END;
  CREATE TRIGGER score_version_only_supersede BEFORE UPDATE ON score_version
  WHEN OLD.superseded_by IS NOT NULL
    OR NEW.id IS NOT OLD.id OR NEW.card_id IS NOT OLD.card_id OR NEW.section IS NOT OLD.section
    OR NEW.value IS NOT OLD.value OR NEW.source IS NOT OLD.source
    OR NEW.confidence IS NOT OLD.confidence OR NEW.reason IS NOT OLD.reason
    OR NEW.station_id IS NOT OLD.station_id OR NEW.operator IS NOT OLD.operator
    OR NEW.created_at IS NOT OLD.created_at
  BEGIN SELECT RAISE(ABORT, 'score versions are append-only'); END;

  -- Penalties are records, never silent. Removing one sets removed_at (and is audited).
  CREATE TABLE penalty (
    id           TEXT PRIMARY KEY,
    number       INTEGER NOT NULL REFERENCES entry (number),
    points       INTEGER NOT NULL,
    reason       TEXT NOT NULL,
    note         TEXT,
    day          INTEGER,
    lap          INTEGER,
    classes_json TEXT,
    station_id   TEXT NOT NULL,
    operator     TEXT,
    created_at   TEXT NOT NULL,
    removed_at   TEXT
  ) STRICT;

  -- Every data change, append-only (ADR 0007).
  CREATE TABLE audit_event (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    id          TEXT NOT NULL UNIQUE,
    at          TEXT NOT NULL,
    station_id  TEXT NOT NULL,
    operator    TEXT,
    kind        TEXT NOT NULL,
    subject     TEXT,
    detail_json TEXT NOT NULL
  ) STRICT;
  CREATE TRIGGER audit_event_no_update BEFORE UPDATE ON audit_event
  BEGIN SELECT RAISE(ABORT, 'the audit log is append-only'); END;
  CREATE TRIGGER audit_event_no_delete BEFORE DELETE ON audit_event
  BEGIN SELECT RAISE(ABORT, 'the audit log is append-only'); END;
  `,
];

/** The schema version a fresh event file gets, and the newest this build can open. */
export const SCHEMA_VERSION = MIGRATIONS.length;
