import type { ValidationIssue } from '@tscore/core';

/** Base class for event store errors. `code` is stable and shown in support bundles (ADR 0012). */
export class StoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

/** The event file was made by a newer tScore. Opening it here could lose data, so we don't. */
export class NewerFileError extends StoreError {
  readonly fileVersion: number;
  readonly supportedVersion: number;
  constructor(fileVersion: number, supportedVersion: number) {
    super(
      'STORE_NEWER_FILE',
      `This event was saved by a newer version of tScore (file version ${fileVersion}; this ` +
        `version reads up to ${supportedVersion}). Update tScore to open it.`,
    );
    this.fileVersion = fileVersion;
    this.supportedVersion = supportedVersion;
  }
}

/** SQLite's integrity check failed on open. */
export class DamagedFileError extends StoreError {
  constructor(detail: string) {
    super(
      'STORE_DAMAGED',
      `The event file failed its integrity check (${detail}). Restore it from a backup.`,
    );
  }
}

/** The event setup failed validation. `issues` lists every problem, for the setup screen. */
export class SetupError extends StoreError {
  readonly issues: readonly ValidationIssue[];
  constructor(issues: readonly ValidationIssue[]) {
    const first = issues
      .slice(0, 3)
      .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
      .join('; ');
    super('STORE_BAD_SETUP', `The event setup isn't valid: ${first}`);
    this.issues = issues;
  }
}
