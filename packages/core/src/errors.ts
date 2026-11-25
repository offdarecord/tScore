/**
 * The error catalogue (ADR 0012): every problem tScore shows the desk, with a public code, what it
 * means and what to do. It generates the guide's error-code page (`docs/guide/errors.md`,
 * `npm run gen:errors`), and the app links each error message to its entry there.
 *
 * Code throws errors with short internal names (`STORE_DAMAGED`); the desk sees the public code
 * (`TS-DB-003`). Several internal names can share one public code when the advice is the same.
 * Public codes never change meaning once released; retire a code rather than reuse it.
 */

export interface ErrorEntry {
  /** `TS-<AREA>-<NNN>`, shown to the desk and in support requests. */
  readonly code: string;
  /** Short heading, in the desk's words. */
  readonly title: string;
  /** What has happened, plainly. */
  readonly meaning: string;
  /** What to do next. */
  readonly fix: string;
  /** The internal names that show this code. */
  readonly internal: readonly string[];
}

/** The areas, in the order the guide lists them. */
export const ERROR_AREAS = [
  { area: 'APP', name: 'General' },
  { area: 'DB', name: 'Event files' },
  { area: 'SET', name: 'Event setup' },
  { area: 'RID', name: 'Riders' },
  { area: 'IMP', name: 'Importing entries' },
  { area: 'CARD', name: 'Cards and scores' },
  { area: 'RES', name: 'Results and penalties' },
  { area: 'LBL', name: 'Card labels' },
] as const;

const LOGS = '`%APPDATA%\\tScore\\logs`';
const ISSUES = 'https://github.com/offdarecord/tScore/issues';

export const ERROR_CATALOGUE: readonly ErrorEntry[] = [
  // General
  {
    code: 'TS-APP-001',
    title: 'Something went wrong',
    meaning:
      "tScore hit a problem it doesn't have a plain message for. Everything saved before it happened is still saved.",
    fix:
      `Try again. If it happens again, close tScore and open it again. If it keeps happening, ` +
      `tell the maintainers at <${ISSUES}>: say what you were doing, give the code, and attach ` +
      `that day's log file from ${LOGS} (it holds rider numbers, never names).`,
    internal: ['APP_UNEXPECTED'],
  },
  {
    code: 'TS-APP-002',
    title: 'Something on the form is missing',
    meaning: "A box was left empty or a choice wasn't made, so nothing was saved.",
    fix: 'The message says which box. Fill it in and try again.',
    internal: ['APP_BAD_REQUEST'],
  },
  {
    code: 'TS-APP-003',
    title: 'No event is open',
    meaning:
      "The screen needed an open event, but none is open, or the event file doesn't hold one.",
    fix:
      'Choose **All events** and open the event again. If the event file itself has no event in ' +
      'it, it is damaged: restore it from a backup (see [Backups and restore](backups.md)).',
    internal: ['APP_NO_EVENT', 'STORE_NO_EVENT'],
  },
  {
    code: 'TS-APP-004',
    title: "That event isn't in the recent list",
    meaning: 'The event was removed from the list on the home screen, or moved.',
    fix: 'Choose **Open event file…** and find the event file (`event.sqlite`) in its folder.',
    internal: ['APP_NOT_RECENT'],
  },
  {
    code: 'TS-APP-005',
    title: "Couldn't open the file",
    meaning:
      "Windows couldn't open the saved file (for example a results PDF) in its usual program.",
    fix:
      'The file is saved. Open it from its folder, or install a program for that kind of file ' +
      '(a PDF reader for PDFs).',
    internal: ['APP_OPEN_FAILED'],
  },

  // Event files
  {
    code: 'TS-DB-001',
    title: 'No tScore event in this folder',
    meaning: "The folder or file chosen isn't a tScore event.",
    fix:
      'Each event has its own folder with an `event.sqlite` file in it. Choose that file. Events ' +
      'are kept in `Documents\\tScore` unless they were saved somewhere else.',
    internal: ['STORE_NOT_AN_EVENT'],
  },
  {
    code: 'TS-DB-002',
    title: 'Saved by a newer tScore',
    meaning:
      "The event was saved by a newer version of tScore. Opening it in this version could lose data, so tScore won't.",
    fix: 'Update tScore on this laptop (see [Getting started](getting-started.md)), then open the event.',
    internal: ['STORE_NEWER_FILE'],
  },
  {
    code: 'TS-DB-003',
    title: 'The event file is damaged',
    meaning:
      'The event file failed its check when it was opened, so tScore stopped before using it.',
    fix: 'Restore the event from its latest backup (see [Backups and restore](backups.md)).',
    internal: ['STORE_DAMAGED'],
  },
  {
    code: 'TS-DB-004',
    title: 'The folder for a new event must be empty',
    meaning: 'A new event needs a folder of its own, and the one chosen already has files in it.',
    fix: 'Choose a new, empty folder, or let tScore make one in `Documents\\tScore`.',
    internal: ['STORE_FOLDER_NOT_EMPTY'],
  },

  // Event setup
  {
    code: 'TS-SET-001',
    title: "The event setup isn't valid",
    meaning:
      "Something in Event setup is missing or contradicts something else, so it wasn't saved.",
    fix: 'Each problem is marked on the Event setup screen. Fix those, then save again.',
    internal: ['STORE_BAD_SETUP'],
  },
  {
    code: 'TS-SET-002',
    title: 'That class has riders',
    meaning: "A class can't be removed or renamed while riders are entered in it.",
    fix: 'On **Riders**, move its riders to another class first, then change the class.',
    internal: ['STORE_CLASS_IN_USE'],
  },
  {
    code: 'TS-SET-003',
    title: 'Cards already use that lap or section',
    meaning:
      "A lap or section can't be taken away from a class while a card already in has scores for it.",
    fix: 'Check the setup is right. If the card is wrong, correct it on **Manual entry** first, then change the setup.',
    internal: ['STORE_CARD_IN_USE'],
  },
  {
    code: 'TS-SET-004',
    title: 'A day has no date',
    meaning: 'Every day of the event needs a date before results can be worked out.',
    fix: 'Set the date for each day in **Event setup**.',
    internal: ['STORE_NO_DATE'],
  },
  {
    code: 'TS-SET-005',
    title: "That picture can't be a logo",
    meaning: 'Logos must be PNG or JPEG pictures.',
    fix: 'Save the logo as a PNG or JPEG (most image programs can), then choose it again.',
    internal: ['STORE_LOGO_TYPE'],
  },
  {
    code: 'TS-SET-006',
    title: 'That logo is too big',
    meaning: 'Logos can be up to 1 MB each, so backups and the results PDF stay small.',
    fix: 'Save a smaller copy (about 1000 pixels wide is plenty for print), then choose it again.',
    internal: ['STORE_LOGO_SIZE'],
  },
  {
    code: 'TS-SET-007',
    title: 'Too many sponsor logos',
    meaning: 'The results have room for up to 8 sponsor logos.',
    fix: 'Remove one before adding another.',
    internal: ['STORE_LOGO_COUNT'],
  },

  // Riders
  {
    code: 'TS-RID-001',
    title: 'That rider number is taken',
    meaning:
      'Each number belongs to one rider for the whole event, and this one is already in use.',
    fix: 'Use another number. **Late entry…** shows the next free one.',
    internal: ['STORE_DUPLICATE_RIDER', 'APP_NUMBER_TAKEN'],
  },
  {
    code: 'TS-RID-002',
    title: 'No rider with that number',
    meaning: "There's no rider entered with the number given.",
    fix: 'Check the number on the card or list. If they are new, add them on **Riders** with **Late entry…**.',
    internal: ['STORE_NO_RIDER'],
  },
  {
    code: 'TS-RID-003',
    title: 'A rider detail is missing or too long',
    meaning:
      'A rider needs a first name or a surname, and names, clubs and machines have a length limit.',
    fix: 'The message says which detail. Shorten or fill it in, then save again.',
    internal: ['STORE_BAD_NAME', 'STORE_BAD_CLUB', 'STORE_BAD_MACHINE'],
  },
  {
    code: 'TS-RID-004',
    title: 'No class with that name',
    meaning: "The class given isn't one of the event's classes.",
    fix: 'Choose a class from the list, or add the class in **Event setup** first.',
    internal: ['STORE_NO_CLASS'],
  },
  {
    code: 'TS-RID-005',
    title: 'A rider must be in one or two classes',
    meaning: 'Each rider rides one class, and can also enter a second class with the same number.',
    fix: 'Choose one class, or two at most.',
    internal: ['STORE_CLASS_COUNT'],
  },

  // Importing entries
  {
    code: 'TS-IMP-001',
    title: 'Not a spreadsheet',
    meaning: 'An entry list must be an Excel workbook (.xlsx or .xls) or a CSV file.',
    fix: 'Download the entry list again from the entry system as Excel or CSV, and choose that file.',
    internal: ['STORE_ENTRY_FILE_TYPE'],
  },
  {
    code: 'TS-IMP-002',
    title: "That file couldn't be found",
    meaning:
      'The file was moved, renamed or deleted after it was chosen, or is on a USB stick that was taken out.',
    fix: 'Choose the file again from where it is now.',
    internal: ['STORE_ENTRY_FILE_MISSING'],
  },
  {
    code: 'TS-IMP-003',
    title: 'That file is too big to be an entry list',
    meaning: 'The file is far bigger than any entry list, so it is probably the wrong file.',
    fix: 'Check you chose the entry list export, not another file.',
    internal: ['STORE_ENTRY_FILE_TOO_BIG'],
  },
  {
    code: 'TS-IMP-004',
    title: "That file couldn't be read",
    meaning: "tScore couldn't read the file as a spreadsheet. Often it is still open in Excel.",
    fix: 'If the file is open in Excel, save it, close Excel and try again. Otherwise download it again.',
    internal: ['STORE_ENTRY_FILE_UNREADABLE'],
  },
  {
    code: 'TS-IMP-005',
    title: "tScore doesn't recognise this file",
    meaning:
      "The spreadsheet isn't an Entryplace or Ridernet export, or a list in the tScore rider-list format.",
    fix:
      'Download the riders export from the entry system again, unchanged. For any other list, ' +
      'copy it into the tScore rider-list format (see [Before the event](before-the-event.md#import-the-entry-list)).',
    internal: ['IMPORT_UNKNOWN_FORMAT'],
  },
  {
    code: 'TS-IMP-006',
    title: 'That is a different export',
    meaning:
      'tScore recognised the file, but it is another report from the entry system, not the riders export.',
    fix: 'The message names the file to choose instead. Download that one and import it.',
    internal: ['IMPORT_OTHER_EXPORT'],
  },
  {
    code: 'TS-IMP-007',
    title: 'A column is missing',
    meaning: 'The entry list is missing a column tScore needs: first name, surname or class.',
    fix: "Download the export again without removing columns. Don't edit it in Excel before importing.",
    internal: ['IMPORT_MISSING_COLUMN'],
  },
  {
    code: 'TS-IMP-008',
    title: 'Some choices still need a decision',
    meaning: "Some class names or double entries in the list haven't been decided yet.",
    fix: 'Work through the items marked on the import screen, then choose **Import** again.',
    internal: ['APP_IMPORT_NOT_READY'],
  },
  {
    code: 'TS-IMP-009',
    title: 'Choose the entry list again',
    meaning:
      'tScore no longer has the list that was being imported, for example after switching events.',
    fix: 'On **Riders**, choose **Import from entry list…** and pick the file again.',
    internal: ['APP_NO_ENTRY_LIST'],
  },

  // Cards and scores
  {
    code: 'TS-CARD-001',
    title: 'That card is already in',
    meaning: 'A card for this rider, day and lap has already been entered.',
    fix: 'Check the rider number and lap on the card. To change the scores, open the card and edit it instead.',
    internal: ['STORE_DUPLICATE_CARD'],
  },
  {
    code: 'TS-CARD-002',
    title: 'No card yet',
    meaning: "There's no card in for this rider, day and lap, so there is nothing to change.",
    fix: 'Enter the card first.',
    internal: ['STORE_NO_CARD'],
  },
  {
    code: 'TS-CARD-003',
    title: "The number of scores doesn't match",
    meaning: "The card has a different number of scores from the sections the rider's class rides.",
    fix: "Check every section has a score. If the class's sections are wrong, fix them in **Event setup**.",
    internal: ['STORE_WRONG_SECTION_COUNT'],
  },
  {
    code: 'TS-CARD-004',
    title: "That isn't a score",
    meaning: "A section has a value the event's scoring doesn't allow.",
    fix: 'The message lists the scores allowed. Correct that section.',
    internal: ['STORE_BAD_SCORE'],
  },
  {
    code: 'TS-CARD-005',
    title: "The rider's class doesn't ride that day",
    meaning: "The day given isn't one the rider's class rides.",
    fix: "Check the day on the card, and the class's days in **Event setup**.",
    internal: ['STORE_NO_DAY'],
  },
  {
    code: 'TS-CARD-006',
    title: 'No such lap',
    meaning: "The lap given is more than the rider's class rides that day.",
    fix: "Check the lap on the card, and the class's laps in **Event setup**.",
    internal: ['STORE_NO_LAP'],
  },
  {
    code: 'TS-CARD-007',
    title: "That section isn't on this card",
    meaning: "The section given is more than the rider's class rides.",
    fix: 'Check the section number.',
    internal: ['STORE_NO_SECTION'],
  },
  {
    code: 'TS-CARD-008',
    title: "That isn't a time",
    meaning: "A time couldn't be understood.",
    fix: 'Type the time as hours and minutes, for example 09:30.',
    internal: ['STORE_BAD_TIME'],
  },

  // Results and penalties
  {
    code: 'TS-RES-001',
    title: 'Results are final',
    meaning: 'Results have been marked final, so nothing that changes them can be saved.',
    fix:
      'To correct something, reopen the results on **Results** with a reason, make the change, then ' +
      'mark them final again (see [Results](results.md#reopen-to-correct-something)).',
    internal: ['STORE_RESULTS_FINAL'],
  },
  {
    code: 'TS-RES-002',
    title: "The results aren't final",
    meaning: 'This needs final results, and they are still provisional.',
    fix: 'Mark the results final on **Results** first.',
    internal: ['STORE_NOT_FINAL'],
  },
  {
    code: 'TS-RES-003',
    title: 'No results yet',
    meaning: 'There are no results to mark final, because no cards are in.',
    fix: 'Enter the cards first.',
    internal: ['APP_RESULTS_INCOMPLETE'],
  },
  {
    code: 'TS-RES-004',
    title: 'Say why',
    meaning: 'Reopening final results needs a reason, so the record shows why they changed.',
    fix: 'Type the reason, then choose **Reopen results** again.',
    internal: ['STORE_NEED_REASON'],
  },
  {
    code: 'TS-RES-005',
    title: 'The results changed',
    meaning:
      'Something changed the results while this was being done, for example on another screen.',
    fix: 'Look at the results again, then try again.',
    internal: ['STORE_REVISION_CHANGED'],
  },
  {
    code: 'TS-RES-006',
    title: 'No such revision',
    meaning: "That version of the final results doesn't exist.",
    fix: 'Choose a revision from the list on **Results**.',
    internal: ['STORE_NO_REVISION'],
  },
  {
    code: 'TS-RES-007',
    title: 'That penalty is not in force',
    meaning: 'The penalty was already removed.',
    fix: 'Nothing to do. The list of penalties shows the ones in force.',
    internal: ['STORE_NO_PENALTY'],
  },
  {
    code: 'TS-RES-008',
    title: 'Say what the penalty is for',
    meaning:
      'A penalty with the reason "Other" needs a note, so the results can say what it was for.',
    fix: 'Type a short note, then add the penalty again.',
    internal: ['APP_PENALTY_NOTE'],
  },

  // Card labels
  {
    code: 'TS-LBL-001',
    title: 'No labels to print',
    meaning: 'With the settings chosen, there are no riders to print labels for.',
    fix: 'Check the riders are entered and the classes or numbers chosen include them.',
    internal: ['APP_NO_LABELS'],
  },
];

const GENERAL: ErrorEntry = ERROR_CATALOGUE.find((e) => e.code === 'TS-APP-001') as ErrorEntry;
const BY_INTERNAL = new Map(ERROR_CATALOGUE.flatMap((e) => e.internal.map((i) => [i, e] as const)));

/** The catalogue entry for an internal error name; the general one if it isn't listed. */
export function errorEntry(internal: string): ErrorEntry {
  return BY_INTERNAL.get(internal) ?? GENERAL;
}

/** The public code (`TS-…`) for an internal error name. */
export function publicErrorCode(internal: string): string {
  return errorEntry(internal).code;
}

/** The entry for a public code, if there is one. */
export function errorByCode(code: string): ErrorEntry | undefined {
  return ERROR_CATALOGUE.find((e) => e.code === code);
}

/** The heading anchor of a code on the error-code page (GitHub's own heading ids). */
export function errorAnchor(code: string): string {
  return code.toLowerCase();
}

/** `docs/guide/errors.md`, generated from the catalogue. */
export function renderErrorCatalogue(): string {
  const out = [
    '<!-- Generated from packages/core/src/errors.ts by `npm run gen:errors`. Do not edit. -->',
    '',
    '# Error codes',
    '',
    'When tScore shows a problem, the message ends with a code like **TS-DB-003**. Find the code',
    'below to see what it means and what to do. In tScore, choose **What to do** on the message to',
    'come straight here.',
    '',
    'If a problem keeps happening, see [Troubleshooting](troubleshooting.md).',
    '',
  ];
  for (const { area, name } of ERROR_AREAS) {
    out.push(`## ${name}`, '');
    for (const e of ERROR_CATALOGUE.filter((x) => x.code.split('-')[1] === area)) {
      out.push(
        `### ${e.code}`,
        '',
        `**${e.title}.** ${e.meaning}`,
        '',
        `**What to do:** ${e.fix}`,
        '',
      );
    }
  }
  return out.join('\n');
}
