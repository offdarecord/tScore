import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImportError, planImport, readEntryList } from '@tscore/core';
import { afterEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readEntryFile } from './entry-file.js';
import type { StoreError } from './errors.js';
import { EventStore } from './event-store.js';
import { SETUP, tempFolder, testContext } from './test-support.js';

// Synthetic entry lists only: real column names, invented people.

const dir = () => mkdtempSync(join(tmpdir(), 'tscore-import-'));
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as StoreError).code;
  }
  return 'no error';
};

const RIDERNET = [
  ['First_Name', 'Last_Name', 'RidernetID', 'DOB', 'Event_Role', 'Event_Class_Name', 'Class_Reg_Status', 'Licence_Type', 'Club', 'Riding_Number'],
  ['Avery', 'Stone', '900001', '01/01/1990', 'Rider', 'Trial 4', 'Active', 'SRN', 'Example Trials Club', '0554'],
  ['Blake', 'River', '900002', '02/02/2012', 'Rider', 'Trial 4 Plus', 'Active', 'JRN', 'Example Trials Club', 'Blake'],
  ['Casey', 'Hill', '900003', '03/03/1980', 'Crew', 'Trial 4', '', 'SRN', 'Example Trials Club', ''],
]; // prettier-ignore

/** SheetJS's ESM build has no file access: write the bytes ourselves. */
function save(book: XLSX.WorkBook, path: string, bookType: XLSX.BookType) {
  writeFileSync(path, XLSX.write(book, { type: 'buffer', bookType }) as Buffer);
}

function workbook(rows: string[][], sheet = 'Sheet1') {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheet);
  return book;
}

describe('reading entry list files', () => {
  it("reads Ridernet's legacy .xls (BIFF8) export", () => {
    const path = join(dir(), 'eventRiders-1-2027-01-01.xls');
    save(workbook(RIDERNET), path, 'biff8');
    const list = readEntryList(readEntryFile(path));
    expect(list.presetId).toBe('ridernet');
    expect(list.rows.map((r) => [r.given_name, r.role])).toEqual([
      ['Avery', 'Rider'],
      ['Blake', 'Rider'],
      ['Casey', 'Crew'],
    ]);
    expect(JSON.stringify(list)).not.toMatch(/1990|0554/);
  });

  it('reads an .xlsx workbook, picking the sheet with the entries', () => {
    const path = join(dir(), 'entries.xlsx');
    const book = workbook([['Date', 'Amount']], 'Takings');
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ['Entry Form Reference', 'First Name', 'Last Name', 'Class', 'Competitive', 'Entry Group', 'Licence Number'],
        ['EF-1', 'Avery', 'Stone', 'Trial 4+ (C+ Grade)', 'Y', 'Solo', 900101],
      ]),
      'Entry List',
    ); // prettier-ignore
    save(book, path, 'xlsx');
    const list = readEntryList(readEntryFile(path));
    expect(list.presetId).toBe('entryplace');
    expect(list.rows[0]).toMatchObject({ class: 'Trial 4+ (C+ Grade)', licence: '900101' });
  });

  it('reads a UTF-8 CSV saved by Excel, keeping values exactly as typed', () => {
    const path = join(dir(), 'riders.csv');
    writeFileSync(
      path,
      '﻿Number,Given name,Family name,Class,Licence\r\n007,Zoë,Ångström,Trial 1,0012345\r\n',
    );
    const list = readEntryList(readEntryFile(path));
    expect(list.rows[0]).toMatchObject({
      number: '007',
      given_name: 'Zoë',
      family_name: 'Ångström',
      licence: '0012345',
    });
  });

  it('refuses other files with a plain message', () => {
    const d = dir();
    writeFileSync(join(d, 'notes.txt'), 'hello');
    writeFileSync(join(d, 'broken.xlsx'), 'not a workbook');
    expect(code(() => readEntryFile(join(d, 'notes.txt')))).toBe('STORE_ENTRY_FILE_TYPE');
    expect(code(() => readEntryFile(join(d, 'missing.xls')))).toBe('STORE_ENTRY_FILE_MISSING');
    // A damaged workbook reads as a scrap of text, which no preset recognises.
    expect(() => readEntryList(readEntryFile(join(d, 'broken.xlsx')))).toThrow(ImportError);
  });
});

describe('importing riders into an event', () => {
  let store: EventStore | undefined;
  afterEach(() => store?.close());

  it('adds every rider and saves the matched class names, in one go', () => {
    store = EventStore.create(tempFolder(), SETUP, testContext());
    const path = join(dir(), 'eventRiders.xls');
    const rows = RIDERNET.map((r) => [...r]);
    rows.push(['Drew', 'Field', '900004', '', 'Rider', 'C Grade', 'Active', 'SRN', '', '']);
    save(workbook(rows), path, 'biff8');
    const list = readEntryList(readEntryFile(path));
    const plan = planImport(list, store.setup, store.entries(), {
      classes: { 'C Grade': 'Trial 4' },
    });
    expect(plan.ready).toBe(true);

    store.importEntries(plan.entries, plan.newAliases, list.source);
    expect(store.entries().map((e) => [e.number, e.classes[0], e.riders[0]?.familyName])).toEqual([
      [1, 'Trial 4 Plus', 'River'],
      [2, 'Trial 4', 'Field'],
      [3, 'Trial 4', 'Stone'],
    ]);
    expect(store.entries()[0]?.riders[0]?.licence).toBe('900002');
    expect(store.setup.classes.find((c) => c.name === 'Trial 4')?.aliases).toEqual(['C Grade']);
    expect(store.auditLog().map((a) => a.kind)).toContain('entry.import');

    // Importing the same list again adds no one.
    const again = planImport(list, store.setup, store.entries());
    expect(again.alreadyEntered).toBe(3);
    expect(again.entries).toEqual([]);
  });

  it('adds nobody if one rider fails', () => {
    store = EventStore.create(tempFolder(), SETUP, testContext());
    const ok = { number: 1, riders: [{ givenName: 'A', familyName: 'B' }], competitionStatus: 'competitive' as const, status: 'riding' as const, classes: ['Trial 4'] };
    expect(code(() => store?.importEntries([ok, { ...ok, number: 2, classes: ['Nope'] }]))).toBe('STORE_NO_CLASS');
    expect(code(() => store?.importEntries([ok, ok]))).toBe('STORE_DUPLICATE_RIDER');
    expect(store.entries()).toEqual([]);
  }); // prettier-ignore
});
