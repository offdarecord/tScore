/**
 * Results in the main process: worked out from the event as saved (never from the window), and
 * saved as a PDF or CSV where the desk chooses.
 *
 * On this laptop results show full names. Anything saved to share (PDF, CSV) applies the
 * publish rules: non-competitive riders' scores are already left out of the payload, and junior
 * surnames become an initial when the desk ticks that option.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeResults,
  juniorClassesFromSetup,
  resultsCsv,
  resultsHtml,
  type ResultsGap,
} from '@tscore/core';
import { StoreError, type EventStore } from '@tscore/store';
import { app, BrowserWindow, dialog, shell } from 'electron';
import type { ExportKind, ResultsView } from '../shared/ipc';

/** The last file saved, the only one "Open" may open. */
let lastExport: string | null = null;

function report(store: EventStore, juniorInitials: boolean) {
  const setup = store.setup;
  return computeResults(store.resultsInput(), {
    generator: { name: 'tScore', version: app.getVersion() },
    generatedAt: new Date().toISOString(),
    status: 'provisional',
    revision: 1,
    ...(juniorInitials && {
      privacy: { juniorSurnameInitialClasses: juniorClassesFromSetup(setup) },
    }),
  });
}

export function resultsView(store: EventStore): ResultsView {
  const { results, gaps } = report(store, false);
  return {
    results,
    gaps: gaps.map((g: ResultsGap) => ({ ...g })),
    juniorClasses: juniorClassesFromSetup(store.setup),
  };
}

const dateWords = (iso: string) =>
  new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(Date.parse(`${iso}T00:00:00Z`))
    .replace(/,/g, '');

/** A safe file name: "DEMO1 results 2027-02-06.pdf". */
function fileName(store: EventStore, kind: ExportKind): string {
  const date = store.setup.days[0]?.date ?? '';
  const base = `${store.setup.event.code} results${date ? ` ${date}` : ''}`;
  return `${base.replace(/[<>:"/\\|?*]/g, '')}.${kind}`;
}

async function pdfOf(html: string): Promise<Buffer> {
  // A hidden window with no scripts, no preload and no network: it only lays out the page.
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true },
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await win.loadURL(
      `data:text/html;charset=utf-8;base64,${Buffer.from(html).toString('base64')}`,
    );
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  } finally {
    win.destroy();
  }
}

/** Ask where to save, then write the file. `null` if the desk cancels. */
export async function exportResults(
  store: EventStore,
  kind: ExportKind,
  juniorInitials: boolean,
  win: BrowserWindow | null,
): Promise<string | null> {
  if (kind !== 'pdf' && kind !== 'csv') {
    throw new StoreError('APP_BAD_REQUEST', 'Choose PDF or CSV.');
  }
  const options: Electron.SaveDialogOptions = {
    title: kind === 'pdf' ? 'Save results as PDF' : 'Save results as CSV',
    defaultPath: join(store.folder, 'exports', fileName(store, kind)),
    filters:
      kind === 'pdf'
        ? [{ name: 'PDF', extensions: ['pdf'] }]
        : [{ name: 'CSV (Excel)', extensions: ['csv'] }],
  };
  const picked = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (picked.canceled || !picked.filePath) return null;

  const { results, gaps } = report(store, juniorInitials === true);
  if (kind === 'csv') {
    writeFileSync(picked.filePath, resultsCsv(results), 'utf8');
  } else {
    const html = resultsHtml(results, {
      gaps,
      dates: store.setup.days.flatMap((d) => (d.date ? [dateWords(d.date)] : [])).join(' – '),
      footer: `Produced by tScore ${app.getVersion()} on ${new Date().toLocaleString('en-AU', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}.`,
    });
    writeFileSync(picked.filePath, await pdfOf(html));
  }
  lastExport = picked.filePath;
  return picked.filePath;
}

/** Note a file just saved elsewhere (e.g. card labels), so "Open" opens it. */
export function rememberExport(path: string): void {
  lastExport = path;
}

/** Open the file just saved, in its usual program (e.g. the PDF viewer). */
export async function openLastExport(): Promise<void> {
  if (lastExport) {
    const problem = await shell.openPath(lastExport);
    if (problem) throw new StoreError('APP_OPEN_FAILED', `Couldn't open the file: ${problem}`);
  }
}
