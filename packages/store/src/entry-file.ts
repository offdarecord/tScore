/**
 * Reading an entry list file (.xlsx, legacy .xls, or .csv) into plain text tables, with
 * SheetJS Community Edition (ADR 0014). Formulas aren't evaluated and macros never run.
 *
 * This returns every cell. The caller must pass the tables straight to `readEntryList`
 * (@tscore/core), which keeps only the columns the matching preset declares; the full tables
 * must not be logged, stored or sent to the window.
 */
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import type { SourceTable } from '@tscore/core';
import * as XLSX from 'xlsx';
import { StoreError } from './errors.js';

/** Entry lists are a few hundred rows; anything this big isn't one. */
const MAX_BYTES = 20 * 1024 * 1024;

/** Excel saves CSV with a byte-order mark (U+FEFF) at the start. */
const withoutBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

export function readEntryFile(path: string): SourceTable[] {
  const ext = extname(path).toLowerCase();
  if (!['.xlsx', '.xlsm', '.xls', '.csv'].includes(ext)) {
    throw new StoreError(
      'STORE_ENTRY_FILE_TYPE',
      'Choose an Excel workbook (.xlsx or .xls) or a CSV file.',
    );
  }
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    throw new StoreError('STORE_ENTRY_FILE_MISSING', "That file couldn't be found.");
  }
  if (size > MAX_BYTES) {
    throw new StoreError('STORE_ENTRY_FILE_TOO_BIG', 'That file is too big to be an entry list.');
  }

  let book: XLSX.WorkBook;
  try {
    const bytes = readFileSync(path);
    book =
      ext === '.csv'
        ? // CSV is read as UTF-8 text (Excel adds a byte-order mark), with every value as typed.
          XLSX.read(withoutBom(bytes.toString('utf8')), { type: 'string', raw: true })
        : XLSX.read(bytes, {
            type: 'buffer',
            cellFormula: false,
            cellHTML: false,
            cellStyles: false,
          });
  } catch {
    throw new StoreError(
      'STORE_ENTRY_FILE_UNREADABLE',
      "That file couldn't be read as a spreadsheet. If it's open in Excel, save it, close it and try again.",
    );
  }

  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name];
    const rows = sheet
      ? XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          raw: false,
          defval: '',
          blankrows: false,
        })
      : [];
    return { sheet: name, rows: rows.map((r) => r.map((c) => (c === null ? '' : String(c)))) };
  });
}
