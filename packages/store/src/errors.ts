import type { ValidationIssue } from '@tscore/core';

/** A message's key in the app's message files, and the values it fills in (#64). */
export interface MessageRef {
  readonly key: string;
  readonly values?: Readonly<Record<string, string | number | boolean | null | undefined>>;
}

/**
 * Base class for event store errors. `code` is stable and shown in support bundles (ADR 0012).
 * `message` is the English; `words` lets the app show it in the laptop's language.
 */
export class StoreError extends Error {
  readonly code: string;
  readonly words: MessageRef | undefined;
  constructor(code: string, message: string, words?: MessageRef) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.words = words;
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
      { key: 'errors.STORE_NEWER_FILE', values: { fileVersion, supportedVersion } },
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
      { key: 'errors.STORE_DAMAGED', values: { detail } },
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
